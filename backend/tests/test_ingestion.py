from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentStatus
from services import ingestion
from tests.conftest import InMemoryStorage, RegisteredUser


async def _pending_document(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> Document:
    document = Document(
        organization_id=user.organization_id,
        uploaded_by=user.id,
        filename='notes.txt',
        status=DocumentStatus.PENDING,
        storage_key=f'{user.organization_id}/notes',
    )
    storage.objects[document.storage_key] = b'content'
    async with session.begin():
        session.add(document)
    return document


async def _status(session: AsyncSession, document_id: UUID) -> Document:
    async with session.begin():
        document = await session.get(Document, document_id)
        await session.refresh(document)
    return document


async def test_process_document_claims_and_downloads_pending_document(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)

    await ingestion.process_document(session, storage, document.id)

    assert (await _status(session, document.id)).status == (
        DocumentStatus.PROCESSING
    )
    assert storage.downloaded == [document.storage_key]


async def test_process_document_skips_document_already_claimed(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)

    await ingestion.process_document(session, storage, document.id)
    await ingestion.process_document(session, storage, document.id)

    assert storage.downloaded == [document.storage_key]


async def test_process_document_ignores_unknown_document(
    session: AsyncSession, storage: InMemoryStorage
) -> None:
    await ingestion.process_document(session, storage, uuid4())

    assert storage.downloaded == []


async def test_process_document_marks_failed_when_download_fails(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)
    storage.objects.clear()

    await ingestion.process_document(session, storage, document.id)

    failed = await _status(session, document.id)
    assert failed.status == DocumentStatus.FAILED
    assert failed.processing_error == 'Could not read the uploaded file'
