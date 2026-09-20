from fastapi import APIRouter

from routes import auth, chat, documents

api_router = APIRouter(prefix='/api/v1')

api_router.include_router(auth.router)
api_router.include_router(documents.router)
api_router.include_router(chat.router)
api_router.include_router(chat.conversations_router)
