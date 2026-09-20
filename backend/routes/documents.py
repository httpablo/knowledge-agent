from uuid import UUID

from fastapi import APIRouter, HTTPException, UploadFile, status

from core.database import SessionDep
from core.dependencies import Auth, Storage
from core.settings import settings
from schemas.documents import DocumentResponse
from services import documents as documents_service

router = APIRouter(prefix='/documents', tags=['documents'])

DOCUMENT_NOT_FOUND = 'Document not found'


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


@router.get('', response_model=list[DocumentResponse])
async def list_documents(
    auth: Auth, session: SessionDep
) -> list[DocumentResponse]:
    documents = await documents_service.list_documents(
        session, auth.organization.id
    )
    return [
        DocumentResponse.model_validate(document) for document in documents
    ]


@router.get('/{document_id}', response_model=DocumentResponse)
async def get_document(
    document_id: UUID, auth: Auth, session: SessionDep
) -> DocumentResponse:
    try:
        document = await documents_service.get_document(
            session, auth.organization.id, document_id
        )
    except documents_service.DocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=DOCUMENT_NOT_FOUND
        ) from exc
    return DocumentResponse.model_validate(document)
