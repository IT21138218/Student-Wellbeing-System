from fastapi import APIRouter, Depends

from app.api.deps import require_roles
from app.models.alerts import AlertsOut
from app.models.user import User
from app.services.alert_service import get_alerts

router = APIRouter(prefix="/alerts", tags=["alerts"])

# Admin: full access always (require_roles' unconditional bypass). Teacher and
# Counselor: the intended audience — a cross-account feed of every student's
# open flags. Student/Parent: no access, this isn't scoped to one child.
_ALLOWED = require_roles("teacher", "counselor")


@router.get("", response_model=AlertsOut)
async def list_alerts(user: User = Depends(_ALLOWED)) -> AlertsOut:
    return await get_alerts(user)
