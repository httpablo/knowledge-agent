from fastapi import APIRouter, HTTPException, UploadFile, status

from core.database import SessionDep
from core.dependencies import Auth, Storage
from core.settings import settings
from schemas.documents import DocumentResponse
from services import documents as documents_service

router = APIRouter(prefix='/documents', tags=['documents'])


@router.post(
    '',
    response_model=DocumentResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_document(
    file: UploadFile, auth: Auth, session: SessionDep, storage: Storage
) -> DocumentResponse:
    content = await file.read(documents_service.MAX_UPLOAD_SIZE_BYTES + 1)
    try:
        document = await documents_service.create_document(
            session,
            storage,
            auth.organization,
            auth.user,
            file.filename or '',
            content,
        )
    except documents_service.InvalidFileError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except documents_service.FileTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f'File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB',
        ) from exc
    except documents_service.ProcessingQueueUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Document processing is temporarily unavailable',
        ) from exc
    return DocumentResponse.model_validate(document)
