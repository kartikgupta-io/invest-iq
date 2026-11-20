"""Notifications endpoints."""

from fastapi import APIRouter, Depends

from app.api.deps import get_store
from app.data.contract import DataStore, NotificationItem

router = APIRouter()


@router.get("", response_model=list[NotificationItem])
async def notifications(store: DataStore = Depends(get_store)) -> list[NotificationItem]:
    return await store.get_notifications()