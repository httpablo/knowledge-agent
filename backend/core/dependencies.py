from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from core.database import SessionDep
from core.security import decode_access_token
from models import Organization, OrganizationMembership, User
from services.storage import StorageService, get_storage

bearer_scheme = HTTPBearer(auto_error=False)

BearerCredentials = Annotated[
    HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
]


@dataclass(frozen=True)
class AuthContext:
    user: User
    organization: Organization


def _credentials_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Could not validate credentials',
        headers={'WWW-Authenticate': 'Bearer'},
    )


async def get_current_user(
    session: SessionDep, credentials: BearerCredentials
) -> User:
    if credentials is None:
        raise _credentials_error()

    try:
        user_id = UUID(decode_access_token(credentials.credentials))
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise _credentials_error() from exc

    async with session.begin():
        user = await session.get(User, user_id)
    if user is None:
        raise _credentials_error()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_auth_context(
    session: SessionDep, user: CurrentUser
) -> AuthContext:
    async with session.begin():
        organizations = (
            await session.scalars(
                select(Organization)
                .join(OrganizationMembership)
                .where(OrganizationMembership.user_id == user.id)
                .limit(2)
            )
        ).all()

    if not organizations:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='User does not belong to an organization',
        )
    if len(organizations) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Multiple organizations are not supported',
        )

    return AuthContext(user=user, organization=organizations[0])


Auth = Annotated[AuthContext, Depends(get_auth_context)]

Storage = Annotated[StorageService, Depends(get_storage)]
