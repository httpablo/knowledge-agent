from http import HTTPStatus
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentChunk, DocumentStatus
from services import ingestion as ingestion_service
from services.llm_client import GroundedAnswer
from services.retrieval import search_chunks
from tests.conftest import (
    FakeLLM,
    InMemoryStorage,
    MakeUser,
    RegisteredUser,
    make_document,
)

FACT = 'Cada colaborador tem 30 dias de férias por ano.'
QUESTION = 'Quantos dias de férias por ano?'


async def _document(
    session: AsyncSession,
    user: RegisteredUser,
    status: DocumentStatus = DocumentStatus.READY,
    storage_key: str | None = None,
    filename: str = 'policy.pdf',
) -> Document:
    document = Document(
        organization_id=user.organization_id,
        uploaded_by=user.id,
        filename=filename,
        status=status,
        storage_key=storage_key,
    )
    async with session.begin():
        session.add(document)
    return document


async def test_ready_document_is_deleted(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    document = await make_document(
        session, user.organization_id, 'policy.pdf', [FACT]
    )

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert response.content == b''

    listed = await client.get('/api/v1/documents', headers=user.headers)
    assert listed.json() == []

    async with session.begin():
        remaining = await session.scalar(
            select(func.count())
            .select_from(Document)
            .where(Document.id == document.id)
        )
    assert remaining == 0


async def test_delete_removes_chunks_and_embeddings_by_cascade(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    document = await make_document(
        session, user.organization_id, 'policy.pdf', [FACT, 'outro trecho']
    )

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NO_CONTENT
    async with session.begin():
        remaining = await session.scalar(
            select(func.count())
            .select_from(DocumentChunk)
            .where(DocumentChunk.document_id == document.id)
        )
    assert remaining == 0


async def test_retrieval_no_longer_finds_the_deleted_document(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    document = await make_document(
        session, user.organization_id, 'policy.pdf', [FACT]
    )

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NO_CONTENT
    chunks = await search_chunks(session, user.organization_id, QUESTION)
    assert chunks == []


async def test_another_organizations_document_is_not_found(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    make_user: MakeUser,
) -> None:
    other = await make_user(name='Bob', email='bob@example.com')
    document = await _document(session, other)

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json() == {'detail': 'Document not found'}
    async with session.begin():
        assert await session.get(Document, document.id) is not None


async def test_unknown_document_is_not_found(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await client.delete(
        f'/api/v1/documents/{uuid4()}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


async def test_processing_document_is_conflict(
    client: AsyncClient,
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    document = await _document(
        session,
        user,
        status=DocumentStatus.PROCESSING,
        storage_key=f'{user.organization_id}/processing-doc',
    )
    storage.objects[document.storage_key] = b'content'
    calls: list[str] = []
    original_delete = storage.delete

    async def spying_delete(key: str) -> None:
        calls.append(key)
        await original_delete(key)

    monkeypatch.setattr(storage, 'delete', spying_delete)

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert calls == []
    assert storage.objects == {document.storage_key: b'content'}
    async with session.begin():
        kept = await session.get(Document, document.id)
    assert kept is not None
    assert kept.status == DocumentStatus.PROCESSING
    assert kept.storage_key == document.storage_key


async def test_pending_document_is_conflict(
    client: AsyncClient,
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    document = await _document(
        session,
        user,
        status=DocumentStatus.PENDING,
        storage_key=f'{user.organization_id}/pending-doc',
    )
    storage.objects[document.storage_key] = b'content'
    calls: list[str] = []
    original_delete = storage.delete

    async def spying_delete(key: str) -> None:
        calls.append(key)
        await original_delete(key)

    monkeypatch.setattr(storage, 'delete', spying_delete)

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert calls == []
    assert storage.objects == {document.storage_key: b'content'}
    async with session.begin():
        kept = await session.get(Document, document.id)
    assert kept is not None
    assert kept.status == DocumentStatus.PENDING
    assert kept.storage_key == document.storage_key


async def test_a_task_queued_before_a_rejected_delete_still_runs_normally(
    client: AsyncClient,
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
) -> None:
    document = await _document(
        session,
        user,
        status=DocumentStatus.PENDING,
        storage_key=f'{user.organization_id}/pending-doc',
        filename='notes.txt',
    )
    storage_key = document.storage_key
    storage.objects[storage_key] = b'content'

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )
    assert response.status_code == HTTPStatus.CONFLICT

    await ingestion_service.process_document(session, storage, document.id)

    assert storage.downloaded == [storage_key]
    async with session.begin():
        processed = await session.get(Document, document.id)
    assert processed.status == DocumentStatus.READY


async def test_failed_document_can_be_deleted(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    document = await _document(
        session, user, status=DocumentStatus.FAILED, storage_key=None
    )

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NO_CONTENT


async def test_storage_object_is_removed_when_still_present(
    client: AsyncClient,
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
) -> None:
    document = await _document(
        session,
        user,
        status=DocumentStatus.FAILED,
        storage_key=f'{user.organization_id}/failed-doc',
    )
    storage.objects[document.storage_key] = b'leftover'

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert storage.objects == {}


async def test_storage_failure_keeps_the_document(
    client: AsyncClient,
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    document = await _document(
        session,
        user,
        status=DocumentStatus.FAILED,
        storage_key=f'{user.organization_id}/failed-doc',
    )
    storage.objects[document.storage_key] = b'leftover'

    async def failing_delete(key: str) -> None:
        raise ConnectionError('storage unreachable')

    monkeypatch.setattr(storage, 'delete', failing_delete)

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    async with session.begin():
        kept = await session.get(Document, document.id)
    assert kept is not None
    assert kept.storage_key == document.storage_key
    assert storage.objects != {}


async def test_deleting_twice_is_not_found_the_second_time(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    document = await make_document(
        session, user.organization_id, 'policy.pdf', [FACT]
    )

    first = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )
    second = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert first.status_code == HTTPStatus.NO_CONTENT
    assert second.status_code == HTTPStatus.NOT_FOUND


async def test_delete_requires_authentication(client: AsyncClient) -> None:
    response = await client.delete(f'/api/v1/documents/{uuid4()}')

    assert response.status_code == HTTPStatus.UNAUTHORIZED


async def test_organization_b_cannot_delete_organization_as_document(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    make_user: MakeUser,
) -> None:
    org_b = await make_user(name='Bob', email='bob@example.com')
    document = await make_document(
        session, user.organization_id, 'policy.pdf', [FACT]
    )

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=org_b.headers
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    async with session.begin():
        assert await session.get(Document, document.id) is not None
    chunks = await search_chunks(session, user.organization_id, QUESTION)
    assert chunks != []


async def test_owning_organization_can_still_delete_it(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    make_user: MakeUser,
) -> None:
    await make_user(name='Bob', email='bob@example.com')
    document = await make_document(
        session, user.organization_id, 'policy.pdf', [FACT]
    )

    response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NO_CONTENT


async def test_old_message_sources_survive_the_delete(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    llm: FakeLLM,
) -> None:
    document = await make_document(
        session, user.organization_id, 'policy.pdf', [FACT]
    )
    llm.answers(
        GroundedAnswer(
            answerable=True, answer='São 30 dias.', source_ids=['S1']
        )
    )
    asked = await client.post(
        '/api/v1/chat', headers=user.headers, json={'question': QUESTION}
    )
    conversation_id = asked.json()['conversation_id']
    original_sources = asked.json()['sources']

    delete_response = await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )
    assert delete_response.status_code == HTTPStatus.NO_CONTENT

    history = await client.get(
        f'/api/v1/conversations/{conversation_id}/messages',
        headers=user.headers,
    )

    assert history.status_code == HTTPStatus.OK
    [_question, answer] = history.json()
    assert answer['sources'] == original_sources
    assert answer['sources'][0]['filename'] == 'policy.pdf'
    assert answer['sources'][0]['content'] == FACT


async def test_new_question_in_the_same_conversation_ignores_deleted_content(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    llm: FakeLLM,
) -> None:
    document = await make_document(
        session, user.organization_id, 'policy.pdf', [FACT]
    )
    llm.answers(
        GroundedAnswer(
            answerable=True, answer='São 30 dias.', source_ids=['S1']
        )
    )
    asked = await client.post(
        '/api/v1/chat', headers=user.headers, json={'question': QUESTION}
    )
    conversation_id = asked.json()['conversation_id']
    calls_before_delete = len(llm.calls)

    await client.delete(
        f'/api/v1/documents/{document.id}', headers=user.headers
    )

    follow_up = await client.post(
        '/api/v1/chat',
        headers=user.headers,
        json={
            'question': QUESTION,
            'conversation_id': conversation_id,
        },
    )

    assert follow_up.status_code == HTTPStatus.OK
    body = follow_up.json()
    assert body['answerable'] is False
    assert not body['answer']
    assert body['sources'] == []
    assert len(llm.calls) == calls_before_delete
