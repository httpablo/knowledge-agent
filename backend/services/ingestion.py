import logging
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import ColumnElement, and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentChunk, DocumentStatus
from services.chunking import TextChunk, chunk_sections
from services.embeddings import (
    EmbeddingError,
    TransientEmbeddingError,
    embed_texts,
    embedding_client,
)
from services.parsing import DocumentParsingError, extract_sections
from services.storage import StorageService

logger = logging.getLogger(__name__)

PROCESSING_TIMEOUT = timedelta(minutes=10)


@dataclass(frozen=True)
class ClaimedDocument:
    id: UUID
    organization_id: UUID
    filename: str
    storage_key: str


class ProcessingLeaseActiveError(Exception):
    def __init__(self, seconds_remaining: int) -> None:
        super().__init__(
            f'Document is being processed; retry in {seconds_remaining}s'
        )
        self.seconds_remaining = seconds_remaining


async def process_document(
    session: AsyncSession, storage: StorageService, document_id: UUID
) -> None:
    document = await _claim_document(session, document_id)
    if document is None:
        await _raise_when_lease_is_active(session, document_id)
        logger.info('Document %s is not claimable; skipping', document_id)
        return

    content = await _download(session, storage, document)
    if content is None:
        return

    chunks = await _split_into_chunks(session, document, content)
    if chunks is None:
        return

    vectors = await _embed(session, document, chunks)
    if vectors is None:
        return

    await _store_chunks(session, document, chunks, vectors)
    await _discard_stored_file(session, storage, document)
    logger.info(
        'Document %s is ready with %d chunks', document.id, len(chunks)
    )


async def _download(
    session: AsyncSession, storage: StorageService, document: ClaimedDocument
) -> bytes | None:
    try:
        return await storage.download(document.storage_key)
    except Exception:
        logger.exception('Could not download document %s', document.id)
        await _mark_failed(
            session, document.id, 'Could not read the uploaded file'
        )
        return None


async def _split_into_chunks(
    session: AsyncSession, document: ClaimedDocument, content: bytes
) -> list[TextChunk] | None:
    try:
        sections = extract_sections(document.filename, content)
    except DocumentParsingError as exc:
        logger.warning(
            'Could not parse document %s: %s',
            document.id,
            exc,
            exc_info=exc.__cause__ is not None,
        )
        await _mark_failed(session, document.id, str(exc))
        return None

    logger.info(
        'Extracted %d sections from document %s', len(sections), document.id
    )
    return chunk_sections(sections)


async def _embed(
    session: AsyncSession, document: ClaimedDocument, chunks: list[TextChunk]
) -> list[list[float]] | None:
    try:
        async with embedding_client() as client:
            return await embed_texts(client, [c.text for c in chunks])
    except TransientEmbeddingError:
        logger.warning(
            'Embeddings for document %s failed transiently', document.id
        )
        await _release_claim(session, document.id)
        raise
    except EmbeddingError as exc:
        logger.exception('Could not embed document %s', document.id)
        await _mark_failed(session, document.id, str(exc))
        return None


async def _store_chunks(
    session: AsyncSession,
    document: ClaimedDocument,
    chunks: list[TextChunk],
    vectors: list[list[float]],
) -> None:
    async with session.begin():
        await session.execute(
            delete(DocumentChunk).where(
                DocumentChunk.document_id == document.id
            )
        )
        session.add_all([
            DocumentChunk(
                organization_id=document.organization_id,
                document_id=document.id,
                content=chunk.text,
                embedding=vector,
                chunk_index=chunk.chunk_index,
                page_number=chunk.page_number,
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ])
        await session.execute(
            update(Document)
            .where(Document.id == document.id)
            .values(status=DocumentStatus.READY, processing_error=None)
        )


async def _discard_stored_file(
    session: AsyncSession, storage: StorageService, document: ClaimedDocument
) -> None:
    try:
        await storage.delete(document.storage_key)
    except Exception:
        logger.exception(
            'Document %s is ready but its file was not removed: %s',
            document.id,
            document.storage_key,
        )
        return

    async with session.begin():
        await session.execute(
            update(Document)
            .where(Document.id == document.id)
            .values(storage_key=None)
        )


async def _claim_document(
    session: AsyncSession, document_id: UUID
) -> ClaimedDocument | None:
    async with session.begin():
        claimed = await session.execute(
            update(Document)
            .where(Document.id == document_id, _is_claimable())
            .values(
                status=DocumentStatus.PROCESSING,
                processing_started_at=func.now(),
            )
            .returning(
                Document.id,
                Document.organization_id,
                Document.filename,
                Document.storage_key,
            )
        )
        row = claimed.one_or_none()
    return ClaimedDocument(*row) if row else None


def _is_claimable() -> ColumnElement[bool]:
    expired = func.now() - PROCESSING_TIMEOUT
    return or_(
        Document.status == DocumentStatus.PENDING,
        and_(
            Document.status == DocumentStatus.PROCESSING,
            Document.processing_started_at < expired,
        ),
    )


async def _raise_when_lease_is_active(
    session: AsyncSession, document_id: UUID
) -> None:
    async with session.begin():
        row = (
            await session.execute(
                select(Document.status, Document.processing_started_at).where(
                    Document.id == document_id
                )
            )
        ).one_or_none()

    if row is None or row.status != DocumentStatus.PROCESSING:
        return

    remaining = (
        row.processing_started_at + PROCESSING_TIMEOUT - datetime.now(UTC)
    )
    if remaining > timedelta(0):
        raise ProcessingLeaseActiveError(math.ceil(remaining.total_seconds()))


async def fail_pending_document(
    session: AsyncSession, document_id: UUID, error: str
) -> None:
    async with session.begin():
        await session.execute(
            update(Document)
            .where(
                Document.id == document_id,
                Document.status == DocumentStatus.PENDING,
            )
            .values(status=DocumentStatus.FAILED, processing_error=error)
        )


async def _release_claim(session: AsyncSession, document_id: UUID) -> None:
    async with session.begin():
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(status=DocumentStatus.PENDING, processing_started_at=None)
        )


async def _mark_failed(
    session: AsyncSession, document_id: UUID, error: str
) -> None:
    async with session.begin():
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(status=DocumentStatus.FAILED, processing_error=error)
        )
