from fastapi import APIRouter
from app.config import settings
from app.schemas import AppSettingsRead, AppSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettingsRead)
def get_settings():
    return AppSettingsRead(base_currency=settings.base_currency)


@router.patch("", response_model=AppSettingsRead)
def update_settings(payload: AppSettingsUpdate):
    settings.base_currency = payload.base_currency
    return AppSettingsRead(base_currency=settings.base_currency)
