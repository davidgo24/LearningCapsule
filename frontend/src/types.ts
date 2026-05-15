export interface ExtractedCapsule {
  title: string
  tags: string[]
  main_idea: string
  questions: string[]
  code_snippets: string[]
  my_conclusions: string[]
  user_commentary: string[]
}

export interface CapsulePayload extends ExtractedCapsule {
  module_label: string
  notes_to_self: string
  key_takeaway: string
  struggles_feedback: string
}

export interface CapsuleSummary {
  capsule_id: string
  title: string
  date: string
  filename: string
}

export interface CapsuleDocument extends CapsulePayload {
  capsule_id: string
  created_at: string
  date: string
}
