from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from models import MembershipRole, Organization, OrganizationMembership, User
from schemas.auth import LoginRequest, RegisterRequest

DUMMY_PASSWORD_HASH = get_password_hash('dummy-password')


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


def normalize_email(email: str) -> str:
    return email.lower()


async def register(session: AsyncSession, data: RegisterRequest) -> str:
    email = normalize_email(data.email)
    password_hash = await run_in_threadpool(get_password_hash, data.password)

    async with session.begin():
        user = await _create_user(session, data.name, email, password_hash)
        await _create_owned_workspace(session, user)

    return create_access_token(str(user.id))


async def login(session: AsyncSession, data: LoginRequest) -> str:
    email = normalize_email(data.email)
    async with session.begin():
        user = await session.scalar(select(User).where(User.email == email))

    password_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    is_valid = await run_in_threadpool(
        verify_password, data.password, password_hash
    )
    if user is None or not is_valid:
        raise InvalidCredentialsError

    return create_access_token(str(user.id))


async def _create_user(
    session: AsyncSession, name: str, email: str, password_hash: str
) -> User:
    if await _email_exists(session, email):
        raise EmailAlreadyRegisteredError

    user = User(name=name, email=email, password_hash=password_hash)
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise EmailAlreadyRegisteredError from exc
    return user


async def _create_owned_workspace(session: AsyncSession, user: User) -> None:
    organization = Organization(name=f'{user.name} Workspace')
    session.add(organization)
    await session.flush()

    session.add(
        OrganizationMembership(
            user_id=user.id,
            organization_id=organization.id,
            role=MembershipRole.OWNER,
        )
    )


async def _email_exists(session: AsyncSession, email: str) -> bool:
    user_id = await session.scalar(select(User.id).where(User.email == email))
    return user_id is not None
