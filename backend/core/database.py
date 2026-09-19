from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from core.settings import settings

engine = create_async_engine(settings.DATABASE_URL.get_secret_value())


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]
