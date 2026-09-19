import logging
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentStatus
from services.storage import StorageService

logger = logging.getLogger(__name__)


async def process_document(
    session: AsyncSession, storage: StorageService, document_id: UUID
) -> None:
    storage_key = await _claim_pending_document(session, document_id)
    if storage_key is None:
        logger.info('Document %s is not pending; skipping', document_id)
        return

    try:
        await storage.download(storage_key)
    except Exception:
        logger.exception('Could not download document %s', document_id)
        await _mark_failed(
            session, document_id, 'Could not read the uploaded file'
        )


async def _claim_pending_document(
    session: AsyncSession, document_id: UUID
) -> str | None:
    async with session.begin():
        return await session.scalar(
            update(Document)
            .where(
                Document.id == document_id,
                Document.status == DocumentStatus.PENDING,
            )
            .values(status=DocumentStatus.PROCESSING)
            .returning(Document.storage_key)
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
