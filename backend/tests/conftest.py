import os
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url, select, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)
from sqlalchemy.pool import NullPool


def _get_test_database_url() -> str:
    url = os.environ.get('TEST_DATABASE_URL', '')
    database = make_url(url).database if url else None
    if not database or not database.endswith('_test'):
        pytest.exit(
            'TEST_DATABASE_URL must point to a database whose name ends '
            "with '_test'; the suite truncates every table between tests.",
            returncode=1,
        )
    return url


TEST_DATABASE_URL = _get_test_database_url()

os.environ['DATABASE_URL'] = TEST_DATABASE_URL

from core.database import get_session
from core.security import decode_access_token
from main import app
from models import OrganizationMembership
from schemas.auth import RegisterRequest
from services import auth as auth_service
from services import documents as documents_service
from services.storage import get_storage

ALEMBIC_INI = Path(__file__).resolve().parents[1] / 'alembic.ini'


@dataclass(frozen=True)
class RegisteredUser:
    id: UUID
    organization_id: UUID
    email: str
    password: str
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {'Authorization': f'Bearer {self.token}'}


class InMemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.downloaded: list[str] = []

    async def upload(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data

    async def download(self, key: str) -> bytes:
        self.downloaded.append(key)
        return self.objects[key]

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)


@pytest.fixture(scope='session', autouse=True)
def migrated_database() -> None:
    config = Config(str(ALEMBIC_INI))
    command.downgrade(config, 'base')
    command.upgrade(config, 'head')


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    yield engine
    async with engine.begin() as conn:
        await conn.execute(text('TRUNCATE users, organizations CASCADE'))
    await engine.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def storage() -> InMemoryStorage:
    return InMemoryStorage()


@pytest.fixture(autouse=True)
def processing_queue(monkeypatch: pytest.MonkeyPatch) -> list[UUID]:
    queued: list[UUID] = []

    async def enqueue(document_id: UUID) -> None:
        queued.append(document_id)

    monkeypatch.setattr(documents_service, '_enqueue_processing', enqueue)
    return queued


@pytest.fixture
async def client(
    engine: AsyncEngine, storage: InMemoryStorage
) -> AsyncIterator[AsyncClient]:
    async def get_test_session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    app.dependency_overrides[get_storage] = lambda: storage
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(
    engine: AsyncEngine,
) -> Callable[..., Awaitable[RegisteredUser]]:
    async def _make_user(
        name: str = 'Alice',
        email: str = 'alice@example.com',
        password: str = 'correct-password',
    ) -> RegisteredUser:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            token = await auth_service.register(
                session,
                RegisterRequest(name=name, email=email, password=password),
            )
            user_id = UUID(decode_access_token(token))
            async with session.begin():
                organization_id = await session.scalar(
                    select(OrganizationMembership.organization_id).where(
                        OrganizationMembership.user_id == user_id
                    )
                )
        return RegisteredUser(
            id=user_id,
            organization_id=organization_id,
            email=email,
            password=password,
            token=token,
        )

    return _make_user


@pytest.fixture
async def user(
    make_user: Callable[..., Awaitable[RegisteredUser]],
) -> RegisteredUser:
    return await make_user()
