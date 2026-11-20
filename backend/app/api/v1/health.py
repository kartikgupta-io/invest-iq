"""Health check endpoint."""

from fastapi import APIRouter

from typing import Any

router = APIRouter()


@router.get("", response_model=dict[str, str])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "investiq-backend"}