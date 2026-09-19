import asyncio
from uuid import uuid4

import pytest
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from core.dependencies import get_auth_context, get_current_user
from models import (
    MembershipRole,
    Organization,
    OrganizationMembership,
    User,
)
from schemas.auth import LoginRequest, RegisterRequest
from services import auth as auth_service
from tests.conftest import RegisteredUser


def _register_request(email: str = 'alice@example.com') -> RegisterRequest:
    return RegisterRequest(
        name='Alice', email=email, password='correct-password'
    )


async def _count_rows(session: AsyncSession) -> tuple[int, int, int]:
    async with session.begin():
        return tuple([
            await session.scalar(select(func.count()).select_from(model))
            for model in (User, Organization, OrganizationMembership)
        ])


async def test_register_creates_owner_membership(
    session: AsyncSession,
) -> None:
    await auth_service.register(session, _register_request())

    async with session.begin():
        membership = await session.scalar(select(OrganizationMembership))
    assert membership.role == MembershipRole.OWNER
    assert await _count_rows(session) == (1, 1, 1)


async def test_register_rolls_back_everything_when_onboarding_fails(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def failing_workspace(session: AsyncSession, user: User) -> None:
        raise RuntimeError('workspace creation failed')

    monkeypatch.setattr(
        auth_service, '_create_owned_workspace', failing_workspace
    )

    with pytest.raises(RuntimeError):
        await auth_service.register(session, _register_request())

    assert await _count_rows(session) == (0, 0, 0)


async def test_register_does_not_map_later_integrity_errors_to_duplicate(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def workspace_with_missing_org(
        session: AsyncSession, user: User
    ) -> None:
        session.add(
            OrganizationMembership(
                user_id=user.id,
                organization_id=uuid4(),
                role=MembershipRole.OWNER,
            )
        )
        await session.flush()

    monkeypatch.setattr(
        auth_service, '_create_owned_workspace', workspace_with_missing_org
    )

    with pytest.raises(IntegrityError):
        await auth_service.register(session, _register_request())

    assert await _count_rows(session) == (0, 0, 0)


async def test_concurrent_duplicate_registration_is_rejected(
    engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def email_always_free(session: AsyncSession, email: str) -> bool:
        return False

    monkeypatch.setattr(auth_service, '_email_exists', email_always_free)

    async def register(email: str) -> str:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            return await auth_service.register(
                session, _register_request(email)
            )

    results = await asyncio.gather(
        register('race@example.com'),
        register('RACE@example.com'),
        return_exceptions=True,
    )

    errors = [r for r in results if isinstance(r, Exception)]
    assert len(errors) == 1
    assert isinstance(errors[0], auth_service.EmailAlreadyRegisteredError)
    assert isinstance(errors[0].__cause__, IntegrityError)


async def test_login_leaves_no_open_transaction(
    session: AsyncSession, user: RegisteredUser
) -> None:
    await auth_service.login(
        session, LoginRequest(email=user.email, password=user.password)
    )

    assert not session.in_transaction()


async def test_auth_dependencies_close_their_read_transactions(
    session: AsyncSession, user: RegisteredUser
) -> None:
    credentials = HTTPAuthorizationCredentials(
        scheme='Bearer', credentials=user.token
    )

    current_user = await get_current_user(session, credentials)
    assert not session.in_transaction()

    auth = await get_auth_context(session, current_user)
    assert not session.in_transaction()
    assert auth.organization.id == user.organization_id
