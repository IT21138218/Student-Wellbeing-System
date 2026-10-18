from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.core.config import get_settings
from app.models.risk import RiskAssessment
from app.models.quiz import QuizAttempt, QuizQuestionNote
from app.models.coping import CopingRecord
from app.models.social import SocialRecord
from app.models.wellbeing import WellbeingAssessment
from app.models.user import User

_client: AsyncIOMotorClient | None = None


async def connect_to_mongo() -> None:
    """Open the Mongo connection and register Beanie document models.

    Call once on app startup. Add every new Beanie Document class to
    `document_models` below or it will silently fail to persist.
    """
    global _client
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.mongo_uri)
    await init_beanie(
        database=_client[settings.mongo_db_name],
        document_models=[
            RiskAssessment, QuizAttempt, QuizQuestionNote, CopingRecord, SocialRecord, WellbeingAssessment, User,
        ],
    )


async def close_mongo_connection() -> None:
    if _client is not None:
        _client.close()
