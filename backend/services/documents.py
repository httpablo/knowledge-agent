from pathlib import Path
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from models import Document, DocumentStatus, Organization, User
from services.storage import StorageService

CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.docx': (
        'application/vnd.openxmlformats-officedocument'
        '.wordprocessingml.document'
    ),
}

MAX_UPLOAD_SIZE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


class InvalidFileError(Exception):
    pass


class FileTooLargeError(Exception):
    pass


async def create_document(
    session: AsyncSession,
    storage: StorageService,
    organization: Organization,
    user: User,
    filename: str,
    content: bytes,
) -> Document:
    filename = Path(filename).name[:255]
    content_type = _validate_file(filename, content)

    document_id = uuid4()
    storage_key = f'{organization.id}/{document_id}'
    await storage.upload(storage_key, content, content_type)

    document = Document(
        id=document_id,
        organization_id=organization.id,
        uploaded_by=user.id,
        filename=filename,
        status=DocumentStatus.PENDING,
        storage_key=storage_key,
    )
    try:
        async with session.begin():
            session.add(document)
    except Exception:
        await storage.delete(storage_key)
        raise

    return document


def _validate_file(filename: str, content: bytes) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in CONTENT_TYPES:
        raise InvalidFileError('Only PDF, TXT and DOCX files are supported')
    if not content:
        raise InvalidFileError('File is empty')
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise FileTooLargeError
    if not _content_matches_extension(extension, content):
        raise InvalidFileError('File content does not match its extension')
    return CONTENT_TYPES[extension]


def _content_matches_extension(extension: str, content: bytes) -> bool:
    if extension == '.pdf':
        return content.startswith(b'%PDF-')
    if extension == '.docx':
        return content.startswith(b'PK\x03\x04')
    try:
        content.decode('utf-8')
    except UnicodeDecodeError:
        return False
    return True
