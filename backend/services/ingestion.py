import logging
from datetime import timedelta
from uuid import UUID

from sqlalchemy import ColumnElement, and_, func, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentStatus
from services.parsing import DocumentParsingError, extract_sections
from services.storage import StorageService

logger = logging.getLogger(__name__)

PROCESSING_TIMEOUT = timedelta(minutes=10)


async def process_document(
    session: AsyncSession, storage: StorageService, document_id: UUID
) -> None:
    claimed = await _claim_document(session, document_id)
    if claimed is None:
        logger.info('Document %s is not claimable; skipping', document_id)
        return
    storage_key, filename = claimed

    try:
        content = await storage.download(storage_key)
    except Exception:
        logger.exception('Could not download document %s', document_id)
        await _mark_failed(
            session, document_id, 'Could not read the uploaded file'
        )
        return

    try:
        sections = extract_sections(filename, content)
    except DocumentParsingError as exc:
        logger.warning(
            'Could not parse document %s: %s',
            document_id,
            exc,
            exc_info=exc.__cause__ is not None,
        )
        await _mark_failed(session, document_id, str(exc))
        return

    logger.info(
        'Extracted %d sections from document %s', len(sections), document_id
    )


async def _claim_document(
    session: AsyncSession, document_id: UUID
) -> tuple[str, str] | None:
    async with session.begin():
        claimed = await session.execute(
            update(Document)
            .where(Document.id == document_id, _is_claimable())
            .values(
                status=DocumentStatus.PROCESSING,
                processing_started_at=func.now(),
            )
            .returning(Document.storage_key, Document.filename)
        )
        row = claimed.one_or_none()
    return tuple(row) if row else None


def _is_claimable() -> ColumnElement[bool]:
    expired = func.now() - PROCESSING_TIMEOUT
    return or_(
        Document.status == DocumentStatus.PENDING,
        and_(
            Document.status == DocumentStatus.PROCESSING,
            Document.processing_started_at < expired,
        ),
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
