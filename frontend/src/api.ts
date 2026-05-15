import type { CapsuleDocument, CapsulePayload, CapsuleSummary, ExtractedCapsule } from './types'

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail)) return JSON.stringify(body.detail)
    return res.statusText
  } catch {
    return res.statusText || `HTTP ${res.status}`
  }
}

export async function extractCapsule(
  rawText: string,
  options?: { geminiKey?: string },
): Promise<ExtractedCapsule> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const k = options?.geminiKey?.trim()
  if (k) headers['X-Gemini-Key'] = k

  const res = await fetch('/api/extract', {
    method: 'POST',
    headers,
    body: JSON.stringify({ raw_text: rawText }),
  })
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}

export async function commitCapsule(payload: CapsulePayload): Promise<{ capsule_id: string; filename: string }> {
  const res = await fetch('/api/capsules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}

export async function listCapsules(): Promise<CapsuleSummary[]> {
  const res = await fetch('/api/capsules')
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}

export async function getCapsule(capsuleId: string): Promise<CapsuleDocument> {
  const res = await fetch(`/api/capsules/${encodeURIComponent(capsuleId)}`)
  if (!res.ok) throw new Error(await parseErrorDetail(res))
  return res.json()
}
