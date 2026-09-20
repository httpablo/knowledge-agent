from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentStatus
from tests.conftest import MakeUser, RegisteredUser

FIELDS = {'id', 'filename', 'status', 'processing_error', 'created_at'}


async def _document(
    session: AsyncSession,
    user: RegisteredUser,
    filename: str,
    status: DocumentStatus = DocumentStatus.READY,
    processing_error: str | None = None,
    created_at: datetime | None = None,
) -> Document:
    document = Document(
        organization_id=user.organization_id,
        uploaded_by=user.id,
        filename=filename,
        status=status,
        processing_error=processing_error,
        storage_key='uploads/secret-key',
        created_at=created_at or datetime.now(UTC),
    )
    async with session.begin():
        session.add(document)
    return document


async def test_list_returns_only_the_requested_fields(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    await _document(session, user, 'policy.pdf')

    response = await client.get('/documents', headers=user.headers)

    assert response.status_code == HTTPStatus.OK
    [document] = response.json()
    assert set(document) == FIELDS
    assert document['filename'] == 'policy.pdf'
    assert 'secret-key' not in response.text


async def test_list_is_ordered_from_newest_to_oldest(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    now = datetime.now(UTC)
    await _document(
        session, user, 'oldest.pdf', created_at=now - timedelta(hours=2)
    )
    await _document(
        session, user, 'newest.pdf', created_at=now - timedelta(minutes=1)
    )
    await _document(
        session, user, 'middle.pdf', created_at=now - timedelta(hours=1)
    )

    response = await client.get('/documents', headers=user.headers)

    assert [document['filename'] for document in response.json()] == [
        'newest.pdf',
        'middle.pdf',
        'oldest.pdf',
    ]


@pytest.mark.parametrize(
    ('status', 'processing_error'),
    [
        (DocumentStatus.PENDING, None),
        (DocumentStatus.PROCESSING, None),
        (DocumentStatus.READY, None),
        (DocumentStatus.FAILED, 'The file could not be parsed'),
    ],
)
async def test_every_status_is_exposed(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    status: DocumentStatus,
    processing_error: str | None,
) -> None:
    document = await _document(
        session, user, 'policy.pdf', status, processing_error
    )

    listed = (await client.get('/documents', headers=user.headers)).json()
    detail = await client.get(
        f'/documents/{document.id}', headers=user.headers
    )

    assert listed[0]['status'] == status
    assert listed[0]['processing_error'] == processing_error
    assert detail.status_code == HTTPStatus.OK
    assert detail.json()['status'] == status
    assert detail.json()['processing_error'] == processing_error


async def test_list_shows_only_documents_of_the_authenticated_organization(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    make_user: MakeUser,
) -> None:
    other = await make_user(name='Bob', email='bob@example.com')
    await _document(session, user, 'mine.pdf')
    await _document(session, other, 'theirs.pdf')

    response = await client.get('/documents', headers=user.headers)

    assert [document['filename'] for document in response.json()] == [
        'mine.pdf'
    ]


async def test_document_of_another_organization_is_not_found(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    make_user: MakeUser,
) -> None:
    other = await make_user(name='Bob', email='bob@example.com')
    document = await _document(session, other, 'theirs.pdf')

    response = await client.get(
        f'/documents/{document.id}', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json() == {'detail': 'Document not found'}


async def test_unknown_document_is_not_found(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await client.get(f'/documents/{uuid4()}', headers=user.headers)

    assert response.status_code == HTTPStatus.NOT_FOUND


async def test_detail_never_exposes_the_storage_key(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    document = await _document(session, user, 'policy.pdf')

    response = await client.get(
        f'/documents/{document.id}', headers=user.headers
    )

    assert set(response.json()) == FIELDS
    assert 'secret-key' not in response.text


async def test_empty_organization_lists_nothing(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await client.get('/documents', headers=user.headers)

    assert response.json() == []


async def test_reading_documents_requires_authentication(
    client: AsyncClient,
) -> None:
    listed = await client.get('/documents')
    detail = await client.get(f'/documents/{uuid4()}')

    assert listed.status_code == HTTPStatus.UNAUTHORIZED
    assert detail.status_code == HTTPStatus.UNAUTHORIZED
