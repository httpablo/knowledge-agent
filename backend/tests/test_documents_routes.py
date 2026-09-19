from http import HTTPStatus
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentStatus, Organization, User
from services import documents as documents_service
from tests.conftest import InMemoryStorage, RegisteredUser

PDF = b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'
DOCX = b'PK\x03\x04\x14\x00\x06\x00'
TXT = 'Olá, conteúdo em UTF-8.'.encode()


async def _upload(
    client: AsyncClient,
    user: RegisteredUser,
    filename: str,
    content: bytes,
    data: dict[str, str] | None = None,
) -> Response:
    return await client.post(
        '/documents',
        headers=user.headers,
        files={'file': (filename, content, 'application/octet-stream')},
        data=data,
    )


@pytest.mark.parametrize(
    ('filename', 'content'),
    [('report.pdf', PDF), ('notes.txt', TXT), ('contract.DOCX', DOCX)],
)
async def test_upload_creates_pending_document_in_user_organization(
    client: AsyncClient,
    session: AsyncSession,
    storage: InMemoryStorage,
    user: RegisteredUser,
    filename: str,
    content: bytes,
) -> None:
    response = await _upload(client, user, filename, content)

    assert response.status_code == HTTPStatus.ACCEPTED
    body = response.json()
    assert body['filename'] == filename
    assert body['status'] == DocumentStatus.PENDING

    async with session.begin():
        document = await session.get(Document, UUID(body['id']))
    assert document.organization_id == user.organization_id
    assert document.uploaded_by == user.id
    assert document.storage_key == f'{user.organization_id}/{document.id}'
    assert storage.objects == {document.storage_key: content}


async def test_upload_ignores_client_supplied_organization(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    response = await _upload(
        client,
        user,
        'notes.txt',
        TXT,
        data={'organization_id': str(uuid4())},
    )

    async with session.begin():
        document = await session.get(Document, UUID(response.json()['id']))
    assert document.organization_id == user.organization_id


async def test_upload_strips_directories_from_filename(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await _upload(client, user, '../../etc/notes.txt', TXT)

    assert response.json()['filename'] == 'notes.txt'


@pytest.mark.parametrize(
    ('filename', 'content', 'detail'),
    [
        (
            'image.png',
            b'\x89PNG',
            'Only PDF, TXT and DOCX files are supported',
        ),
        ('no-extension', TXT, 'Only PDF, TXT and DOCX files are supported'),
        ('empty.txt', b'', 'File is empty'),
        ('fake.pdf', TXT, 'File content does not match its extension'),
        ('fake.docx', PDF, 'File content does not match its extension'),
        (
            'latin1.txt',
            'Olá'.encode('latin-1'),
            'File content does not match its extension',
        ),
    ],
)
async def test_upload_rejects_invalid_files(
    client: AsyncClient,
    storage: InMemoryStorage,
    user: RegisteredUser,
    filename: str,
    content: bytes,
    detail: str,
) -> None:
    response = await _upload(client, user, filename, content)

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json() == {'detail': detail}
    assert storage.objects == {}


async def test_upload_rejects_file_over_size_limit(
    client: AsyncClient,
    storage: InMemoryStorage,
    user: RegisteredUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(documents_service, 'MAX_UPLOAD_SIZE_BYTES', 10)

    response = await _upload(client, user, 'big.txt', b'x' * 11)

    assert response.status_code == HTTPStatus.REQUEST_ENTITY_TOO_LARGE
    assert storage.objects == {}


async def test_upload_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(
        '/documents', files={'file': ('notes.txt', TXT, 'text/plain')}
    )

    assert response.status_code == HTTPStatus.UNAUTHORIZED


async def test_create_document_removes_stored_file_when_insert_fails(
    session: AsyncSession, storage: InMemoryStorage, user: RegisteredUser
) -> None:
    missing_organization = Organization(id=uuid4(), name='Missing')

    with pytest.raises(IntegrityError):
        await documents_service.create_document(
            session,
            storage,
            missing_organization,
            User(id=user.id),
            'notes.txt',
            TXT,
        )

    assert storage.objects == {}
