from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4
from zipfile import BadZipFile, ZipFile

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from models import Document, DocumentStatus, Organization, User
from services.storage import StorageService
from tasks.ingestion import process_document

CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.docx': (
        'application/vnd.openxmlformats-officedocument'
        '.wordprocessingml.document'
    ),
}

DOCX_REQUIRED_PARTS = {
    '[Content_Types].xml',
    '_rels/.rels',
    'word/document.xml',
}

MAX_UPLOAD_SIZE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


class InvalidFileError(Exception):
    pass


class FileTooLargeError(Exception):
    pass


class ProcessingQueueUnavailableError(Exception):
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

    try:
        await _enqueue_processing(document_id)
    except Exception as exc:
        async with session.begin():
            await session.execute(
                delete(Document).where(Document.id == document_id)
            )
        await storage.delete(storage_key)
        raise ProcessingQueueUnavailableError from exc

    return document


async def _enqueue_processing(document_id: UUID) -> None:
    await run_in_threadpool(process_document.delay, str(document_id))


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
        return _is_docx_package(content)
    try:
        content.decode('utf-8')
    except UnicodeDecodeError:
        return False
    return True


def _is_docx_package(content: bytes) -> bool:
    try:
        with ZipFile(BytesIO(content)) as package:
            return DOCX_REQUIRED_PARTS <= set(package.namelist())
    except BadZipFile:
        return False
