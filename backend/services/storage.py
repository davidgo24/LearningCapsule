"""JSON file persistence under capsules directory (local or volume-mounted)."""

from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path

from backend.models import CapsuleDocument, CapsulePayload, CapsuleSummary, build_capsule_document

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _resolve_capsules_dir() -> Path:
    raw = os.environ.get("CAPSULES_DIR", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return (_REPO_ROOT / "capsules").resolve()


CAPSULES_DIR = _resolve_capsules_dir()


def slugify(title: str) -> str:
    s = title.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[-\s]+", "-", s).strip("-")
    return (s[:60] or "capsule").rstrip("-")


def ensure_capsules_dir() -> None:
    CAPSULES_DIR.mkdir(parents=True, exist_ok=True)


def save_capsule(payload: CapsulePayload) -> tuple[str, str]:
    """Write capsule JSON; returns (capsule_id, filename)."""
    ensure_capsules_dir()
    cid = uuid.uuid4().hex[:10]
    doc = build_capsule_document(payload, capsule_id=cid)
    fname = f"{doc.date}_{cid}_{slugify(payload.title)}.json"
    path = CAPSULES_DIR / fname
    path.write_text(doc.model_dump_json(indent=2), encoding="utf-8")
    return cid, fname


def list_capsules() -> list[CapsuleSummary]:
    ensure_capsules_dir()
    rows: list[tuple[float, CapsuleSummary]] = []
    for path in sorted(CAPSULES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            cid = data.get("capsule_id")
            title = data.get("title") or "(untitled)"
            d = data.get("date") or ""
            if cid:
                rows.append(
                    (
                        path.stat().st_mtime,
                        CapsuleSummary(
                            capsule_id=cid,
                            title=str(title),
                            date=str(d),
                            filename=path.name,
                        ),
                    )
                )
        except (json.JSONDecodeError, OSError):
            continue
    rows.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in rows]


def load_capsule(capsule_id: str) -> CapsuleDocument | None:
    ensure_capsules_dir()
    for path in CAPSULES_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("capsule_id") == capsule_id:
                return CapsuleDocument.model_validate(data)
        except (json.JSONDecodeError, OSError, ValueError):
            continue
    return None
