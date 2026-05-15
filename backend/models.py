"""Pydantic models for API and Gemini structured extraction."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class ExtractedCapsule(BaseModel):
    """Structured extraction — user validates before committing (Gemini JSON schema)."""

    title: str = Field(description="Short, specific title for this learning session")
    tags: list[str] = Field(
        default_factory=list,
        description="Topics / technologies / module keywords",
    )
    main_idea: str = Field(
        default="",
        description="One paragraph: what this conversation was fundamentally about",
    )
    questions: list[str] = Field(
        default_factory=list,
        description="Questions that were asked or explored (learner or tutor)",
    )
    code_snippets: list[str] = Field(
        default_factory=list,
        description="Important code blocks from the chat (preserve language)",
    )
    my_conclusions: list[str] = Field(
        default_factory=list,
        description=(
            "Things the LEARNER said that show resolved understanding: confirmations, "
            "'oh I see why…', corrections they articulated — not the assistant's prose"
        ),
    )
    user_commentary: list[str] = Field(
        default_factory=list,
        description=(
            "Learner remarks that read like notes-to-self during chat: aha moments, "
            "frustration, reminders — short bullets"
        ),
    )


class ExtractRequest(BaseModel):
    raw_text: str = Field(..., min_length=1)


class CapsulePayload(BaseModel):
    """Client sends validated extraction plus enrichment; server assigns ids and dates."""

    title: str = ""
    tags: list[str] = Field(default_factory=list)
    main_idea: str = ""
    questions: list[str] = Field(default_factory=list)
    code_snippets: list[str] = Field(default_factory=list)
    my_conclusions: list[str] = Field(default_factory=list)
    user_commentary: list[str] = Field(default_factory=list)
    module_label: str = ""
    notes_to_self: str = ""
    key_takeaway: str = ""
    struggles_feedback: str = ""


class CapsuleDocument(CapsulePayload):
    capsule_id: str
    created_at: str
    date: str


class CapsuleSummary(BaseModel):
    capsule_id: str
    title: str
    date: str
    filename: str


class CapsuleCommitResponse(BaseModel):
    capsule_id: str
    filename: str


def build_capsule_document(payload: CapsulePayload, *, capsule_id: str) -> CapsuleDocument:
    today = date.today().isoformat()
    now = datetime.now().isoformat(timespec="seconds")
    data = payload.model_dump()
    return CapsuleDocument(
        capsule_id=capsule_id,
        created_at=now,
        date=today,
        **data,
    )
