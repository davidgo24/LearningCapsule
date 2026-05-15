"""Gemini extraction for chat exports."""

from __future__ import annotations

import os

from google import genai
from google.genai import types

from backend.models import ExtractedCapsule

SYSTEM_INSTRUCTION = """You are helping build a personal learning capsule from an exported AI tutoring chat.

Rules:
- Prefer quoting or lightly cleaning the LEARNER's own words for `my_conclusions` and `user_commentary`.
- Do NOT paste long assistant monologues into `my_conclusions`; reserve that field for the learner's voice.
- For `code_snippets`, extract only meaningful blocks (omit trivial one-liners unless crucial).
- Use concise bullets where lists are requested.
- If the transcript does not clearly separate roles, infer learner vs assistant from typical patterns (questions vs explanations).

Output must strictly match the requested JSON schema."""

DEFAULT_MODEL = "gemini-2.0-flash"


def extract_from_chat(raw_text: str, *, api_key: str | None = None, model: str | None = None) -> ExtractedCapsule:
    key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise ValueError(
            "Missing API key. Set GEMINI_API_KEY in .env (see .env.example)."
        )

    model_id = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
    client = genai.Client(api_key=key)

    user_prompt = (
        "Analyze this chat export and fill every field of the capsule schema.\n\n"
        "--- BEGIN CHAT EXPORT ---\n"
        f"{raw_text.strip()}\n"
        "--- END CHAT EXPORT ---"
    )

    response = client.models.generate_content(
        model=model_id,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            # Pydantic model belongs on response_schema; response_json_schema expects a JSON-serializable dict.
            response_schema=ExtractedCapsule,
        ),
    )

    if not response.text:
        raise RuntimeError("Gemini returned empty text — try again or shorten the export.")

    return ExtractedCapsule.model_validate_json(response.text)
