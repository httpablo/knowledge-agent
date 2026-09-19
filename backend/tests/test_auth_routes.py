from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from uuid import uuid4

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from models import MembershipRole, Organization, OrganizationMembership
from tests.conftest import RegisteredUser

CREDENTIALS_ERROR = {'detail': 'Could not validate credentials'}
INVALID_LOGIN = {'detail': 'Invalid credentials'}


def _sign(payload: dict, key: str | None = None) -> str:
    return jwt.encode(
        payload,
        key or settings.JWT_SECRET_KEY.get_secret_value(),
        algorithm=settings.JWT_ALGORITHM,
    )


def _in(minutes: int) -> datetime:
    return datetime.now(UTC) + timedelta(minutes=minutes)


async def test_register_returns_token_for_new_workspace(
    client: AsyncClient,
) -> None:
    response = await client.post(
        '/auth/register',
        json={
            'name': 'Alice',
            'email': 'alice@example.com',
            'password': 'correct-password',
        },
    )

    assert response.status_code == HTTPStatus.CREATED
    token = response.json()['access_token']
    me = await client.get(
        '/auth/me', headers={'Authorization': f'Bearer {token}'}
    )
    assert me.json()['organization']['name'] == 'Alice Workspace'


async def test_register_rejects_email_already_used_in_any_case(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await client.post(
        '/auth/register',
        json={
            'name': 'Other',
            'email': user.email.upper(),
            'password': 'another-password',
        },
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json() == {'detail': 'Email already registered'}


@pytest.mark.parametrize(
    ('field', 'value'),
    [
        ('name', '   '),
        ('email', 'not-an-email'),
        ('password', 'short'),
        ('password', 'x' * 129),
    ],
)
async def test_register_validates_payload(
    client: AsyncClient, field: str, value: str
) -> None:
    payload = {
        'name': 'Alice',
        'email': 'alice@example.com',
        'password': 'correct-password',
        field: value,
    }

    response = await client.post('/auth/register', json=payload)

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()['detail'][0]['loc'] == ['body', field]


async def test_login_normalizes_email(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await client.post(
        '/auth/login',
        json={
            'email': f'  {user.email.upper()} ',
            'password': user.password,
        },
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()['token_type'] == 'bearer'


async def test_login_does_not_reveal_whether_account_exists(
    client: AsyncClient, user: RegisteredUser
) -> None:
    wrong_password = await client.post(
        '/auth/login',
        json={'email': user.email, 'password': 'wrong-password'},
    )
    unknown_email = await client.post(
        '/auth/login',
        json={'email': 'nobody@example.com', 'password': user.password},
    )

    for response in (wrong_password, unknown_email):
        assert response.status_code == HTTPStatus.UNAUTHORIZED
        assert response.json() == INVALID_LOGIN
        assert response.headers['WWW-Authenticate'] == 'Bearer'


async def test_me_returns_user_and_organization(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await client.get('/auth/me', headers=user.headers)

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {
        'user': {'id': str(user.id), 'name': 'Alice', 'email': user.email},
        'organization': {
            'id': str(user.organization_id),
            'name': 'Alice Workspace',
        },
    }


@pytest.mark.parametrize(
    'authorization',
    [
        None,
        'Basic abc',
        'Bearer not-a-jwt',
        'Bearer ' + _sign({'sub': str(uuid4()), 'exp': _in(5)}, 'x' * 32),
        'Bearer ' + _sign({'sub': str(uuid4()), 'exp': _in(-5)}),
        'Bearer ' + _sign({'sub': str(uuid4())}),
        'Bearer ' + _sign({'exp': _in(5)}),
        'Bearer ' + _sign({'sub': 'not-a-uuid', 'exp': _in(5)}),
        'Bearer ' + _sign({'sub': str(uuid4()), 'exp': _in(5)}),
    ],
    ids=[
        'missing header',
        'wrong scheme',
        'malformed token',
        'wrong signature',
        'expired',
        'missing exp',
        'missing sub',
        'sub not uuid',
        'unknown user',
    ],
)
async def test_me_rejects_invalid_credentials_uniformly(
    client: AsyncClient, authorization: str | None
) -> None:
    headers = {'Authorization': authorization} if authorization else {}

    response = await client.get('/auth/me', headers=headers)

    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert response.json() == CREDENTIALS_ERROR
    assert response.headers['WWW-Authenticate'] == 'Bearer'


async def test_me_rejects_user_with_multiple_memberships(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    async with session.begin():
        other = Organization(name='Other')
        session.add(other)
        await session.flush()
        session.add(
            OrganizationMembership(
                user_id=user.id,
                organization_id=other.id,
                role=MembershipRole.MEMBER,
            )
        )

    response = await client.get('/auth/me', headers=user.headers)

    assert response.status_code == HTTPStatus.CONFLICT


async def test_me_rejects_user_without_membership(
    client: AsyncClient, session: AsyncSession, user: RegisteredUser
) -> None:
    async with session.begin():
        membership = await session.get(
            OrganizationMembership, (user.id, user.organization_id)
        )
        await session.delete(membership)

    response = await client.get('/auth/me', headers=user.headers)

    assert response.status_code == HTTPStatus.FORBIDDEN
