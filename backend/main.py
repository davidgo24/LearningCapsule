"""FastAPI application and HTTP routes."""

from __future__ import annotations

import os
from pathlib import Path

from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.models import CapsuleCommitResponse, CapsulePayload, CapsuleSummary, ExtractRequest, ExtractedCapsule
from backend.services.extract import extract_from_chat
from backend.services.storage import load_capsule, list_capsules, save_capsule

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

app = FastAPI(title="LearningCapsule API", version="1.0.0")

_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
_extra = os.environ.get("ALLOW_ORIGINS", "").strip()
allow_origins = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _stripped_optional(s: str | None) -> str | None:
    if s is None:
        return None
    t = s.strip()
    return t or None


@app.post("/api/extract", response_model=ExtractedCapsule)
async def api_extract(
    body: ExtractRequest,
    x_gemini_key: Annotated[str | None, Header(alias="X-Gemini-Key")] = None,
) -> ExtractedCapsule:
    try:
        return extract_from_chat(body.raw_text, api_key=_stripped_optional(x_gemini_key))
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini error: {e}") from e


@app.post("/api/capsules", response_model=CapsuleCommitResponse)
async def api_create_capsule(payload: CapsulePayload) -> CapsuleCommitResponse:
    capsule_id, filename = save_capsule(payload)
    return CapsuleCommitResponse(capsule_id=capsule_id, filename=filename)


@app.get("/api/capsules", response_model=list[CapsuleSummary])
async def api_list_capsules() -> list[CapsuleSummary]:
    return list_capsules()


@app.get("/api/capsules/{capsule_id}")
async def api_get_capsule(capsule_id: str):
    doc = load_capsule(capsule_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Capsule not found")
    return doc.model_dump()


_frontend_dist = ROOT / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="spa")
