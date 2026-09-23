import asyncio
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from celery.exceptions import Retry
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

import tasks.ingestion as ingestion_task
from models import (
    EMBEDDING_DIMENSIONS,
    Document,
    DocumentChunk,
    DocumentStatus,
    ProcessingErrorCode,
)
from services import ingestion
from services.chunking import chunk_sections
from services.embeddings import EmbeddingError, TransientEmbeddingError
from services.parsing import extract_sections
from tests.conftest import (
    FakeEmbeddings,
    InMemoryStorage,
    RegisteredUser,
    fake_embedding,
)

FIXTURES = Path(__file__).parent / 'fixtures'


def _big_text_content(paragraphs: int = 150) -> bytes:
    """Text sized so `chunk_sections` yields exactly one chunk per
    paragraph, i.e. `paragraphs` chunks in total: enough to span 3
    embedding/persistence batches (64 + 64 + 22) at CHUNK_BATCH_SIZE=64.
    """
    filler = (
        'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do '
        'eiusmod tempor incididunt ut labore et dolore magna aliqua. '
    )
    return '\n\n'.join(
        f'Paragraph {index}. {filler * 6}' for index in range(paragraphs)
    ).encode()


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


async def _chunks(
    session: AsyncSession, document_id: UUID
) -> list[DocumentChunk]:
    async with session.begin():
        return list(
            await session.scalars(
                select(DocumentChunk)
                .where(DocumentChunk.document_id == document_id)
                .order_by(DocumentChunk.chunk_index)
            )
        )


async def _set_status(
    session: AsyncSession,
    document_id: UUID,
    status: DocumentStatus,
    started_at: datetime | None = None,
) -> None:
    async with session.begin():
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(status=status, processing_started_at=started_at)
        )


async def test_document_becomes_ready_with_persisted_chunks(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    content = (FIXTURES / 'policy.pdf').read_bytes()
    document = await _pending_document(
        session, storage, user, 'policy.pdf', content
    )

    await ingestion.process_document(session, storage, document.id)

    ready = await _reload(session, document.id)
    assert ready.status == DocumentStatus.READY
    assert ready.processing_error is None
    assert ready.storage_key is None

    chunks = await _chunks(session, document.id)
    assert [chunk.chunk_index for chunk in chunks] == list(range(len(chunks)))
    assert {chunk.organization_id for chunk in chunks} == {
        user.organization_id
    }
    assert {chunk.page_number for chunk in chunks} == {1, 2}
    assert all(
        len(chunk.embedding) == EMBEDDING_DIMENSIONS for chunk in chunks
    )
    assert 'direito a 30 dias de férias' in chunks[0].content


async def test_ready_document_file_is_removed_from_storage(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)

    await ingestion.process_document(session, storage, document.id)

    assert storage.objects == {}
    assert (await _reload(session, document.id)).storage_key is None


async def test_missing_object_counts_as_a_finished_cleanup(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)
    original_delete = storage.delete

    async def delete_twice(key: str) -> None:
        await original_delete(key)
        await original_delete(key)

    storage.delete = delete_twice

    await ingestion.process_document(session, storage, document.id)

    assert (await _reload(session, document.id)).storage_key is None


async def test_document_stays_ready_when_file_removal_fails(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    document = await _pending_document(session, storage, user)
    storage_key = document.storage_key

    async def failing_delete(key: str) -> None:
        raise ConnectionError('storage unreachable')

    monkeypatch.setattr(storage, 'delete', failing_delete)

    with caplog.at_level(logging.ERROR, logger='services.ingestion'):
        await ingestion.process_document(session, storage, document.id)

    kept = await _reload(session, document.id)
    assert kept.status == DocumentStatus.READY
    assert kept.storage_key == storage_key
    assert await _chunks(session, document.id)
    assert 'was not removed' in caplog.text


async def test_reprocessing_replaces_previous_chunks(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)
    async with session.begin():
        session.add(
            DocumentChunk(
                organization_id=user.organization_id,
                document_id=document.id,
                content='stale chunk',
                embedding=[0.0] * EMBEDDING_DIMENSIONS,
                chunk_index=0,
                page_number=None,
            )
        )

    await ingestion.process_document(session, storage, document.id)

    chunks = await _chunks(session, document.id)
    assert [chunk.content for chunk in chunks] == ['content']


async def test_embeddings_are_requested_for_every_chunk(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    embeddings: FakeEmbeddings,
) -> None:
    content = (FIXTURES / 'policy.pdf').read_bytes()
    document = await _pending_document(
        session, storage, user, 'policy.pdf', content
    )

    await ingestion.process_document(session, storage, document.id)

    chunks = await _chunks(session, document.id)
    assert embeddings.batches == [[chunk.content for chunk in chunks]]


async def test_transient_embedding_failure_releases_the_claim(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    embeddings: FakeEmbeddings,
) -> None:
    document = await _pending_document(session, storage, user)
    document_id = document.id
    embeddings.error = TransientEmbeddingError('service unavailable')

    with pytest.raises(TransientEmbeddingError):
        await ingestion.process_document(session, storage, document_id)

    # The failed batch rolls back the transaction, which expires every
    # attribute SQLAlchemy is tracking on `document` (including its id) -
    # `document_id` was captured above so later assertions don't touch it.
    released = await _reload(session, document_id)
    assert released.status == DocumentStatus.PENDING
    assert released.processing_started_at is None
    assert released.storage_key is not None
    assert storage.objects
    assert await _chunks(session, document_id) == []


async def test_permanent_embedding_failure_marks_document_failed(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    embeddings: FakeEmbeddings,
) -> None:
    document = await _pending_document(session, storage, user)
    document_id = document.id
    embeddings.error = EmbeddingError('The embedding request was rejected')

    await ingestion.process_document(session, storage, document_id)

    failed = await _reload(session, document_id)
    assert failed.status == DocumentStatus.FAILED
    assert failed.processing_error == ProcessingErrorCode.EMBEDDING_FAILED
    assert await _chunks(session, document_id) == []


async def test_claim_records_the_processing_start_time(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)

    await ingestion.process_document(session, storage, document.id)

    processed = await _reload(session, document.id)
    assert datetime.now(UTC) - processed.processing_started_at < timedelta(
        minutes=1
    )


async def test_active_lease_asks_for_a_retry(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)
    await _set_status(
        session,
        document.id,
        DocumentStatus.PROCESSING,
        datetime.now(UTC) - timedelta(minutes=2),
    )

    with pytest.raises(ingestion.ProcessingLeaseActiveError) as error:
        await ingestion.process_document(session, storage, document.id)

    lease = ingestion.PROCESSING_TIMEOUT.total_seconds()
    assert 0 < error.value.seconds_remaining <= lease - 100
    assert storage.downloaded == []


@pytest.mark.parametrize(
    'status', [DocumentStatus.READY, DocumentStatus.FAILED]
)
async def test_finished_documents_are_ignored(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    status: DocumentStatus,
) -> None:
    document = await _pending_document(session, storage, user)
    await _set_status(session, document.id, status)

    await ingestion.process_document(session, storage, document.id)

    assert storage.downloaded == []
    assert (await _reload(session, document.id)).status == status


async def test_unknown_document_is_ignored(
    session: AsyncSession, storage: InMemoryStorage
) -> None:
    await ingestion.process_document(session, storage, uuid4())

    assert storage.downloaded == []


async def test_concurrent_executions_claim_the_document_only_once(
    engine: AsyncEngine,
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
) -> None:
    document = await _pending_document(session, storage, user)

    async def process() -> None:
        async with AsyncSession(engine, expire_on_commit=False) as other:
            try:
                await ingestion.process_document(other, storage, document.id)
            except ingestion.ProcessingLeaseActiveError:
                pass

    await asyncio.gather(process(), process())

    assert storage.downloaded == [document.storage_key]
    assert len(await _chunks(session, document.id)) == 1


async def test_expired_processing_is_claimed_again(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)
    storage_key = document.storage_key
    await _set_status(
        session,
        document.id,
        DocumentStatus.PROCESSING,
        datetime.now(UTC)
        - ingestion.PROCESSING_TIMEOUT
        - timedelta(minutes=1),
    )

    await ingestion.process_document(session, storage, document.id)

    assert storage.downloaded == [storage_key]
    assert (await _reload(session, document.id)).status == (
        DocumentStatus.READY
    )


async def test_document_without_text_fails_before_embedding(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    embeddings: FakeEmbeddings,
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
    assert failed.processing_error == ProcessingErrorCode.NO_EXTRACTABLE_TEXT
    assert embeddings.batches == []


async def test_download_failure_marks_document_failed(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)
    storage.objects.clear()

    await ingestion.process_document(session, storage, document.id)

    failed = await _reload(session, document.id)
    assert failed.status == DocumentStatus.FAILED
    assert failed.processing_error == ProcessingErrorCode.FILE_UNREADABLE


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
    assert failed.processing_error == ProcessingErrorCode.PARSING_FAILED
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
    assert statuses == [DocumentStatus.READY] * len(ids)
    assert storage.downloaded == keys


def test_worker_task_retries_while_the_lease_is_active(
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ingestion_task, 'storage', storage)
    document = _new_document(storage, user)
    document.status = DocumentStatus.PROCESSING
    document.processing_started_at = datetime.now(UTC) - timedelta(minutes=1)
    document_id = document.id
    asyncio.run(_insert([document]))

    with pytest.raises(Retry) as retry:
        ingestion_task.process_document.apply(
            args=[str(document_id)], throw=True
        )

    lease = ingestion.PROCESSING_TIMEOUT.total_seconds()
    assert 0 < retry.value.when <= lease - 50
    assert storage.downloaded == []


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


def _ingestion_records(
    caplog: pytest.LogCaptureFixture,
) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == 'services.ingestion']


def test_worker_task_retries_after_a_transient_embedding_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def failing(*args: object) -> None:
        raise TransientEmbeddingError('service unavailable')

    monkeypatch.setattr(ingestion, 'process_document', failing)

    with pytest.raises(Retry) as retry:
        ingestion_task.process_document.apply(args=[str(uuid4())], throw=True)

    assert retry.value.when == ingestion_task.TRANSIENT_RETRY_DELAY


def test_worker_task_fails_the_document_on_the_last_retry(
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ingestion_task, 'storage', storage)
    document = _new_document(storage, user)
    document_id = document.id
    asyncio.run(_insert([document]))

    async def failing(*args: object) -> None:
        raise TransientEmbeddingError('service unavailable')

    monkeypatch.setattr(ingestion, 'process_document', failing)

    ingestion_task.process_document.apply(
        args=[str(document_id)],
        retries=ingestion_task.MAX_RETRIES,
        throw=True,
    )

    status, error = asyncio.run(_outcome(document_id))
    assert status == DocumentStatus.FAILED
    assert error == ProcessingErrorCode.EMBEDDING_UNAVAILABLE


async def _outcome(document_id: UUID) -> tuple[DocumentStatus, str]:
    async with AsyncSession(ingestion_task.engine) as session:
        async with session.begin():
            return (
                await session.execute(
                    select(Document.status, Document.processing_error).where(
                        Document.id == document_id
                    )
                )
            ).one()


def test_worker_task_stops_retrying_a_leased_document(
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def leased(*args: object) -> None:
        raise ingestion.ProcessingLeaseActiveError(30)

    monkeypatch.setattr(ingestion, 'process_document', leased)

    with caplog.at_level(logging.WARNING, logger='tasks.ingestion'):
        ingestion_task.process_document.apply(
            args=[str(uuid4())],
            retries=ingestion_task.MAX_RETRIES,
            throw=True,
        )

    assert 'is still leased' in caplog.text


async def test_failed_document_also_releases_its_stored_file(
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
    assert failed.storage_key is None
    assert storage.objects == {}


async def test_failed_document_keeps_its_key_when_removal_fails(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    document = await _pending_document(
        session,
        storage,
        user,
        'scan.pdf',
        (FIXTURES / 'blank.pdf').read_bytes(),
    )
    storage_key = document.storage_key

    async def failing_delete(key: str) -> None:
        raise ConnectionError('storage unreachable')

    monkeypatch.setattr(storage, 'delete', failing_delete)

    await ingestion.process_document(session, storage, document.id)

    failed = await _reload(session, document.id)
    assert failed.status == DocumentStatus.FAILED
    assert failed.storage_key == storage_key


async def test_large_document_is_persisted_across_multiple_batches(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    embeddings: FakeEmbeddings,
) -> None:
    content = _big_text_content(150)
    document = await _pending_document(
        session, storage, user, 'big.txt', content
    )

    expected_chunks = chunk_sections(extract_sections('big.txt', content))
    assert len(expected_chunks) == 150  # sanity: sized for 3 batches

    await ingestion.process_document(session, storage, document.id)

    ready = await _reload(session, document.id)
    assert ready.status == DocumentStatus.READY

    persisted = await _chunks(session, document.id)
    assert len(persisted) == 150
    assert [chunk.chunk_index for chunk in persisted] == list(range(150))
    assert [chunk.content for chunk in persisted] == [
        expected.text for expected in expected_chunks
    ]
    assert [chunk.page_number for chunk in persisted] == [
        expected.page_number for expected in expected_chunks
    ]
    assert {chunk.organization_id for chunk in persisted} == {
        user.organization_id
    }
    assert {chunk.document_id for chunk in persisted} == {document.id}

    # Embeddings stayed aligned to their own chunk through the batching.
    for chunk, expected in zip(persisted, expected_chunks, strict=True):
        assert chunk.embedding == pytest.approx(
            fake_embedding(expected.text), rel=1e-4, abs=1e-6
        )

    # HTTP batching *and* memory batching: 3 separate calls, not one
    # covering all 150 chunks at once.
    assert [len(batch) for batch in embeddings.batches] == [64, 64, 22]


async def test_embedding_failure_mid_batches_rolls_back_everything(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content = _big_text_content(150)
    document = await _pending_document(
        session, storage, user, 'big.txt', content
    )
    document_id = document.id
    calls = 0

    async def failing_on_second_batch(
        client: object, texts: list[str]
    ) -> list[list[float]]:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise EmbeddingError('The embedding request was rejected')
        return [fake_embedding(text) for text in texts]

    monkeypatch.setattr(ingestion, 'embed_batch', failing_on_second_batch)

    await ingestion.process_document(session, storage, document_id)

    # The rollback expires every attribute SQLAlchemy tracks on `document`
    # (including its id), so the id captured above is used from here on.
    failed = await _reload(session, document_id)
    assert failed.status == DocumentStatus.FAILED
    assert failed.processing_error == ProcessingErrorCode.EMBEDDING_FAILED
    assert calls == 2
    assert await _chunks(session, document_id) == []


async def test_failure_on_last_batch_rolls_back_earlier_flushed_batches(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content = _big_text_content(150)
    document = await _pending_document(
        session, storage, user, 'big.txt', content
    )
    document_id = document.id
    calls = 0

    async def failing_on_last_batch(
        client: object, texts: list[str]
    ) -> list[list[float]]:
        nonlocal calls
        calls += 1
        if calls == 3:
            raise EmbeddingError('The embedding request was rejected')
        return [fake_embedding(text) for text in texts]

    monkeypatch.setattr(ingestion, 'embed_batch', failing_on_last_batch)

    await ingestion.process_document(session, storage, document_id)

    failed = await _reload(session, document_id)
    # Batches 1 and 2 (128 chunks) were flushed to Postgres successfully
    # before batch 3 failed; the transaction rollback must undo those
    # flushes too, not just skip the failed batch.
    assert failed.status == DocumentStatus.FAILED
    assert calls == 3
    assert await _chunks(session, document_id) == []


async def test_reprocessing_failure_mid_batches_preserves_old_chunks(
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content = _big_text_content(150)
    document = await _pending_document(
        session, storage, user, 'big.txt', content
    )
    document_id = document.id
    async with session.begin():
        session.add(
            DocumentChunk(
                organization_id=user.organization_id,
                document_id=document_id,
                content='stale chunk',
                embedding=[0.0] * EMBEDDING_DIMENSIONS,
                chunk_index=0,
                page_number=None,
            )
        )
    calls = 0

    async def failing_on_second_batch(
        client: object, texts: list[str]
    ) -> list[list[float]]:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise TransientEmbeddingError('service unavailable')
        return [fake_embedding(text) for text in texts]

    monkeypatch.setattr(ingestion, 'embed_batch', failing_on_second_batch)

    with pytest.raises(TransientEmbeddingError):
        await ingestion.process_document(session, storage, document_id)

    kept = await _reload(session, document_id)
    assert kept.status == DocumentStatus.PENDING
    stale = await _chunks(session, document_id)
    assert [chunk.content for chunk in stale] == ['stale chunk']


async def test_giving_up_on_embeddings_also_releases_the_stored_file(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    document = await _pending_document(session, storage, user)

    await ingestion.fail_pending_document(
        session,
        storage,
        document.id,
        ProcessingErrorCode.EMBEDDING_UNAVAILABLE,
    )

    failed = await _reload(session, document.id)
    assert failed.status == DocumentStatus.FAILED
    assert failed.processing_error == ProcessingErrorCode.EMBEDDING_UNAVAILABLE
    assert failed.storage_key is None
    assert storage.objects == {}
