from fastapi import APIRouter

from app.api.v1.routes import alerts, auth, coping, forecast, overview, quiz, report, risk, social, students, wellbeing

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(students.router)
api_router.include_router(risk.router)
api_router.include_router(quiz.router)
api_router.include_router(coping.router)
api_router.include_router(social.router)
api_router.include_router(wellbeing.router)
api_router.include_router(forecast.router)
api_router.include_router(overview.router)
api_router.include_router(report.router)
api_router.include_router(alerts.router)
