import logging
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentStatus
from services.parsing import DocumentParsingError, extract_sections
from services.storage import StorageService

logger = logging.getLogger(__name__)


async def process_document(
    session: AsyncSession, storage: StorageService, document_id: UUID
) -> None:
    claimed = await _claim_pending_document(session, document_id)
    if claimed is None:
        logger.info('Document %s is not pending; skipping', document_id)
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
        logger.warning('Could not parse document %s: %s', document_id, exc)
        await _mark_failed(session, document_id, str(exc))
        return

    logger.info(
        'Extracted %d sections from document %s', len(sections), document_id
    )


async def _claim_pending_document(
    session: AsyncSession, document_id: UUID
) -> tuple[str, str] | None:
    async with session.begin():
        claimed = await session.execute(
            update(Document)
            .where(
                Document.id == document_id,
                Document.status == DocumentStatus.PENDING,
            )
            .values(status=DocumentStatus.PROCESSING)
            .returning(Document.storage_key, Document.filename)
        )
        row = claimed.one_or_none()
    return tuple(row) if row else None


async def _mark_failed(
    session: AsyncSession, document_id: UUID, error: str
) -> None:
    async with session.begin():
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(status=DocumentStatus.FAILED, processing_error=error)
        )
