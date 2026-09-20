import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi.concurrency import run_in_threadpool

from core.settings import settings


class StorageBucketError(Exception):
    def __init__(self, bucket: str) -> None:
        super().__init__(f'Storage bucket {bucket!r} is not available')


class StorageService:
    def __init__(self) -> None:
        self._bucket = settings.STORAGE_BUCKET
        self._client = boto3.client(
            's3',
            endpoint_url=settings.STORAGE_ENDPOINT_URL,
            aws_access_key_id=settings.STORAGE_ACCESS_KEY.get_secret_value(),
            aws_secret_access_key=(
                settings.STORAGE_SECRET_KEY.get_secret_value()
            ),
            region_name=settings.STORAGE_REGION,
            config=Config(s3={'addressing_style': 'path'}),
        )

    async def ensure_bucket(self) -> None:
        try:
            await run_in_threadpool(
                self._client.head_bucket, Bucket=self._bucket
            )
        except ClientError as exc:
            bucket_missing = exc.response['Error']['Code'] in {
                '404',
                'NoSuchBucket',
            }
            if not (bucket_missing and settings.STORAGE_AUTO_CREATE_BUCKET):
                raise StorageBucketError(self._bucket) from exc
            await run_in_threadpool(
                self._client.create_bucket, Bucket=self._bucket
            )

    async def upload(self, key: str, data: bytes, content_type: str) -> None:
        await run_in_threadpool(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    async def download(self, key: str) -> bytes:
        response = await run_in_threadpool(
            self._client.get_object, Bucket=self._bucket, Key=key
        )
        return await run_in_threadpool(response['Body'].read)

    async def delete(self, key: str) -> None:
        try:
            await run_in_threadpool(
                self._client.delete_object, Bucket=self._bucket, Key=key
            )
        except ClientError as exc:
            if exc.response['Error']['Code'] not in {'404', 'NoSuchKey'}:
                raise


storage = StorageService()


def get_storage() -> StorageService:
    return storage
