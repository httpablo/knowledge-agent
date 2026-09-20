import asyncio
import logging
from uuid import UUID

from celery import Task
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from core.settings import settings
from services import ingestion
from services.embeddings import TransientEmbeddingError
from services.storage import storage
from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

MAX_RETRIES = 5
TRANSIENT_RETRY_DELAY = 30
EMBEDDINGS_UNAVAILABLE = (
    'Could not generate embeddings; the service was unavailable'
)

engine = create_async_engine(
    settings.DATABASE_URL.get_secret_value(), poolclass=NullPool
)


@celery_app.task(bind=True, max_retries=MAX_RETRIES)
def process_document(self: Task, document_id: str) -> None:
    try:
        asyncio.run(_process_document(UUID(document_id)))
    except ingestion.ProcessingLeaseActiveError as exc:
        if _budget_is_over(self):
            logger.warning(
                'Document %s is still leased after %d retries',
                document_id,
                MAX_RETRIES,
            )
            return
        raise self.retry(countdown=exc.seconds_remaining, exc=exc) from exc
    except TransientEmbeddingError as exc:
        if _budget_is_over(self):
            logger.error(
                'Giving up on document %s after %d embedding retries',
                document_id,
                MAX_RETRIES,
            )
            asyncio.run(_fail_document(UUID(document_id)))
            return
        countdown = TRANSIENT_RETRY_DELAY * 2**self.request.retries
        raise self.retry(countdown=countdown, exc=exc) from exc


def _budget_is_over(task: Task) -> bool:
    return task.request.retries >= MAX_RETRIES


async def _process_document(document_id: UUID) -> None:
    async with _session() as session:
        await ingestion.process_document(session, storage, document_id)


async def _fail_document(document_id: UUID) -> None:
    async with _session() as session:
        await ingestion.fail_pending_document(
            session, storage, document_id, EMBEDDINGS_UNAVAILABLE
        )


def _session() -> AsyncSession:
    return AsyncSession(engine, expire_on_commit=False)
