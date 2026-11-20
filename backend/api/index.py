"""Vercel serverless entrypoint for the InvestIQ FastAPI application.

Mangum adapts the ASGI app to the serverless (event, context) contract used by
Vercel's Python runtime. The FastAPI app itself is unchanged — every route,
including /api/v1/*, is served through this single function.
"""

import sys
from pathlib import Path

# When the project root is `backend/`, the `app` package sits beside this file.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mangum import Mangum

from app.main import app

handler = Mangum(app, lifespan="off")
