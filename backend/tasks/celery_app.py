from celery import Celery

from core.settings import settings

celery_app = Celery(
    'knowledge_agent',
    broker=settings.REDIS_URL,
    include=['tasks.ingestion'],
)

celery_app.conf.update(
    task_ignore_result=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    broker_transport_options={'visibility_timeout': 900},
    task_publish_retry_policy={
        'max_retries': 2,
        'interval_start': 0,
        'interval_step': 0.5,
        'interval_max': 1,
    },
)
