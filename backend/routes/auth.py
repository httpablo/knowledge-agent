from fastapi import APIRouter, HTTPException, status

from core.database import SessionDep
from core.dependencies import Auth
from schemas.auth import (
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
)
from services import auth as auth_service

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post(
    '/register',
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    data: RegisterRequest, session: SessionDep
) -> TokenResponse:
    try:
        token = await auth_service.register(session, data)
    except auth_service.EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Email already registered',
        ) from exc
    return TokenResponse(access_token=token)


@router.post('/login', response_model=TokenResponse)
async def login(data: LoginRequest, session: SessionDep) -> TokenResponse:
    try:
        token = await auth_service.login(session, data)
    except auth_service.InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid credentials',
            headers={'WWW-Authenticate': 'Bearer'},
        ) from exc
    return TokenResponse(access_token=token)


@router.get('/me', response_model=MeResponse)
async def me(auth: Auth) -> MeResponse:
    return MeResponse.model_validate(auth)
