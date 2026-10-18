from fastapi import APIRouter, HTTPException

from app.models.overview import OverviewStats
from app.services.overview_service import get_overview_stats

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("/stats", response_model=OverviewStats)
async def stats() -> OverviewStats:
    """Real cohort stats from the actual 300-student dataset, not
    hardcoded numbers. Deliberately not role-gated — this is aggregate,
    cohort-level data (no individual student detail beyond what's already
    shown to any logged-in staff role), same sensitivity level as the
    /students list endpoints in forecast.py and social.py."""
    try:
        return await get_overview_stats()
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
