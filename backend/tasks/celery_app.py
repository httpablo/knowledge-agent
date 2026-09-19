from celery import Celery

from core.settings import settings

celery_app = Celery(
    'knowledge_agent',
    broker=settings.REDIS_URL,
    include=['tasks.ingestion'],
)

celery_app.conf.update(
    task_ignore_result=True,
    broker_connection_retry_on_startup=True,
    task_publish_retry_policy={
        'max_retries': 2,
        'interval_start': 0,
        'interval_step': 0.5,
        'interval_max': 1,
    },
)
