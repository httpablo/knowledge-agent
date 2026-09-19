import asyncio
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

import tasks.ingestion as ingestion_task
from models import Document, DocumentStatus
from services import ingestion
from tests.conftest import InMemoryStorage, RegisteredUser

FIXTURES = Path(__file__).parent / 'fixtures'


def _new_document(
    storage: InMemoryStorage,
    user: RegisteredUser,
    filename: str = 'notes.txt',
    content: bytes = b'content',
) -> Document:
    document = Document(
        id=uuid4(),
        organization_id=user.organization_id,
        uploaded_by=user.id,
        filename=filename,
        status=DocumentStatus.PENDING,
    )
    document.storage_key = f'{user.organization_id}/{document.id}'
    storage.objects[document.storage_key] = content
    return document


async def _pending_document(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    filename: str = 'notes.txt',
    content: bytes = b'content',
) -> Document:
    document = _new_document(storage, user, filename, content)
    async with session.begin():
        session.add(document)
    return document


async def _reload(session: AsyncSession, document_id: UUID) -> Document:
    async with session.begin():
        document = await session.get(Document, document_id)
        await session.refresh(document)
    return document


@pytest.mark.parametrize(
    ('filename', 'sections'),
    [('policy.pdf', 2), ('security.txt', 1), ('handbook.docx', 1)],
)
async def test_process_document_extracts_sections_from_real_files(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    caplog: pytest.LogCaptureFixture,
    filename: str,
    sections: int,
) -> None:
    content = (FIXTURES / filename).read_bytes()
    document = await _pending_document(
        session, storage, user, filename, content
    )

    with caplog.at_level(logging.INFO, logger='services.ingestion'):
        await ingestion.process_document(session, storage, document.id)

    assert (await _reload(session, document.id)).status == (
        DocumentStatus.PROCESSING
    )
    assert storage.downloaded == [document.storage_key]
    assert f'Extracted {sections} sections from document {document.id}' in (
        caplog.text
    )


async def test_claim_records_the_processing_start_time(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)

    await ingestion.process_document(session, storage, document.id)

    claimed = await _reload(session, document.id)
    assert claimed.status == DocumentStatus.PROCESSING
    assert datetime.now(UTC) - claimed.processing_started_at < timedelta(
        minutes=1
    )


async def test_process_document_skips_document_already_claimed(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)

    await ingestion.process_document(session, storage, document.id)
    await ingestion.process_document(session, storage, document.id)

    assert storage.downloaded == [document.storage_key]


async def test_concurrent_executions_claim_the_document_only_once(
    engine: AsyncEngine,
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
) -> None:
    document = await _pending_document(session, storage, user)

    async def process() -> None:
        async with AsyncSession(engine, expire_on_commit=False) as other:
            await ingestion.process_document(other, storage, document.id)

    await asyncio.gather(process(), process())

    assert storage.downloaded == [document.storage_key]


async def test_expired_processing_is_claimed_again(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)
    await ingestion.process_document(session, storage, document.id)
    stale = (
        datetime.now(UTC) - ingestion.PROCESSING_TIMEOUT - timedelta(minutes=1)
    )
    await _set_processing_started_at(session, document.id, stale)

    await ingestion.process_document(session, storage, document.id)

    recovered = await _reload(session, document.id)
    assert storage.downloaded == [document.storage_key] * 2
    assert recovered.status == DocumentStatus.PROCESSING
    assert recovered.processing_started_at > stale


async def test_recent_processing_is_not_claimed_again(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)
    await ingestion.process_document(session, storage, document.id)
    recent = (
        datetime.now(UTC) - ingestion.PROCESSING_TIMEOUT + timedelta(minutes=1)
    )
    await _set_processing_started_at(session, document.id, recent)

    await ingestion.process_document(session, storage, document.id)

    assert storage.downloaded == [document.storage_key]


async def _set_processing_started_at(
    session: AsyncSession, document_id: UUID, moment: datetime
) -> None:
    async with session.begin():
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(processing_started_at=moment)
        )


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

    failed = await _reload(session, document.id)
    assert failed.status == DocumentStatus.FAILED
    assert failed.processing_error == 'Could not read the uploaded file'


async def test_process_document_marks_failed_when_no_text_is_found(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(
        session,
        storage,
        user,
        'scan.pdf',
        (FIXTURES / 'blank.pdf').read_bytes(),
    )

    await ingestion.process_document(session, storage, document.id)

    failed = await _reload(session, document.id)
    assert failed.status == DocumentStatus.FAILED
    assert failed.processing_error == (
        'The PDF has no extractable text; scanned or image-only PDFs '
        'are not supported'
    )


async def test_parsing_failure_logs_traceback_but_stores_sanitized_error(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    caplog: pytest.LogCaptureFixture,
) -> None:
    document = await _pending_document(
        session, storage, user, 'broken.pdf', b'%PDF-1.7\nnot really a pdf'
    )

    with caplog.at_level(logging.WARNING, logger='services.ingestion'):
        await ingestion.process_document(session, storage, document.id)

    failed = await _reload(session, document.id)
    assert failed.processing_error == 'The file could not be parsed'
    (record,) = _ingestion_records(caplog)
    assert record.exc_info
    assert 'Traceback' in caplog.text


async def test_parsing_failure_without_technical_cause_has_no_traceback(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    caplog: pytest.LogCaptureFixture,
) -> None:
    document = await _pending_document(
        session, storage, user, 'empty.txt', b'   '
    )

    with caplog.at_level(logging.WARNING, logger='services.ingestion'):
        await ingestion.process_document(session, storage, document.id)

    (record,) = _ingestion_records(caplog)
    assert not record.exc_info


def _ingestion_records(
    caplog: pytest.LogCaptureFixture,
) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == 'services.ingestion']


def test_worker_task_runs_sequentially_on_fresh_event_loops(
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ingestion_task, 'storage', storage)
    documents = [
        _new_document(storage, user, name, (FIXTURES / name).read_bytes())
        for name in ('policy.pdf', 'security.txt', 'handbook.docx')
    ]
    ids = [document.id for document in documents]
    keys = [document.storage_key for document in documents]
    asyncio.run(_insert(documents))

    for document_id in ids:
        ingestion_task.process_document(str(document_id))

    statuses = asyncio.run(_statuses(ids))
    assert statuses == [DocumentStatus.PROCESSING] * len(ids)
    assert storage.downloaded == keys


async def _insert(documents: list[Document]) -> None:
    async with AsyncSession(ingestion_task.engine) as session:
        async with session.begin():
            session.add_all(documents)


async def _statuses(document_ids: list[UUID]) -> list[DocumentStatus]:
    async with AsyncSession(ingestion_task.engine) as session:
        async with session.begin():
            statuses = dict(
                (
                    await session.execute(
                        select(Document.id, Document.status).where(
                            Document.id.in_(document_ids)
                        )
                    )
                ).all()
            )
    return [statuses[document_id] for document_id in document_ids]
