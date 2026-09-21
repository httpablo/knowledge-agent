import logging
import math
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from sqlalchemy import (
    ColumnElement,
    and_,
    delete,
    extract,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentChunk, DocumentStatus
from services.chunking import TextChunk, chunk_sections
from services.embeddings import (
    EmbeddingError,
    TransientEmbeddingError,
    embed_texts,
    embedding_client,
)
from services.parsing import (
    DocumentParsingError,
    ExtractedSection,
    extract_sections,
)
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


class _ProcessingFailure(Exception):
    """Carries the message stored in Document.processing_error."""


async def process_document(
    session: AsyncSession, storage: StorageService, document_id: UUID
) -> None:
    document = await _claim_document(session, document_id)
    if document is None:
        await _raise_when_lease_is_active(session, document_id)
        logger.info('Document %s is not claimable; skipping', document_id)
        return

    try:
        chunks = await _prepare_chunks(storage, document)
        vectors = await _embed(document, chunks)
    except _ProcessingFailure as exc:
        await _fail(session, document.id, str(exc))
        await _discard_stored_file(
            session, storage, document.id, document.storage_key
        )
        return
    except TransientEmbeddingError:
        logger.warning(
            'Embeddings for document %s failed transiently', document.id
        )
        await _release_claim(session, document.id)
        raise

    await _store_chunks(session, document, chunks, vectors)
    await _discard_stored_file(
        session, storage, document.id, document.storage_key
    )
    logger.info(
        'Document %s is ready with %d chunks', document.id, len(chunks)
    )


async def _prepare_chunks(
    storage: StorageService, document: ClaimedDocument
) -> list[TextChunk]:
    content = await _download(storage, document)
    sections = _extract_text(document, content)
    logger.info(
        'Extracted %d sections from document %s', len(sections), document.id
    )
    return chunk_sections(sections)


async def _download(
    storage: StorageService, document: ClaimedDocument
) -> bytes:
    try:
        return await storage.download(document.storage_key)
    except Exception as exc:
        logger.exception('Could not download document %s', document.id)
        raise _ProcessingFailure('Could not read the uploaded file') from exc


def _extract_text(
    document: ClaimedDocument, content: bytes
) -> list[ExtractedSection]:
    try:
        return extract_sections(document.filename, content)
    except DocumentParsingError as exc:
        logger.warning(
            'Could not parse document %s: %s',
            document.id,
            exc,
            exc_info=exc.__cause__ is not None,
        )
        raise _ProcessingFailure(str(exc)) from exc


async def _embed(
    document: ClaimedDocument, chunks: list[TextChunk]
) -> list[list[float]]:
    try:
        async with embedding_client() as client:
            return await embed_texts(client, [chunk.text for chunk in chunks])
    except TransientEmbeddingError:
        raise
    except EmbeddingError as exc:
        logger.exception('Could not embed document %s', document.id)
        raise _ProcessingFailure(str(exc)) from exc


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
    session: AsyncSession,
    storage: StorageService,
    document_id: UUID,
    storage_key: str,
) -> None:
    try:
        await storage.delete(storage_key)
    except Exception:
        logger.exception(
            'File of document %s was not removed: %s',
            document_id,
            storage_key,
        )
        return

    async with session.begin():
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
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
    return or_(
        Document.status == DocumentStatus.PENDING,
        and_(
            Document.status == DocumentStatus.PROCESSING,
            Document.processing_started_at < func.now() - PROCESSING_TIMEOUT,
        ),
    )


async def _raise_when_lease_is_active(
    session: AsyncSession, document_id: UUID
) -> None:
    lease_ends_at = Document.processing_started_at + PROCESSING_TIMEOUT
    async with session.begin():
        remaining = await session.scalar(
            select(extract('epoch', lease_ends_at - func.now())).where(
                Document.id == document_id,
                Document.status == DocumentStatus.PROCESSING,
            )
        )

    if remaining is not None and remaining > 0:
        raise ProcessingLeaseActiveError(math.ceil(remaining))


async def _release_claim(session: AsyncSession, document_id: UUID) -> None:
    async with session.begin():
        await session.execute(
            update(Document)
            .where(
                Document.id == document_id,
                Document.status == DocumentStatus.PROCESSING,
            )
            .values(status=DocumentStatus.PENDING, processing_started_at=None)
        )


async def fail_pending_document(
    session: AsyncSession,
    storage: StorageService,
    document_id: UUID,
    error: str,
) -> None:
    async with session.begin():
        storage_key = await session.scalar(
            update(Document)
            .where(
                Document.id == document_id,
                Document.status == DocumentStatus.PENDING,
            )
            .values(status=DocumentStatus.FAILED, processing_error=error)
            .returning(Document.storage_key)
        )
    if storage_key:
        await _discard_stored_file(session, storage, document_id, storage_key)


async def _fail(session: AsyncSession, document_id: UUID, error: str) -> None:
    async with session.begin():
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(status=DocumentStatus.FAILED, processing_error=error)
        )
