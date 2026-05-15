import { startTransition, useCallback, useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import './App.css'
import { commitCapsule, extractCapsule, getCapsule, listCapsules } from './api'
import type { CapsuleDocument, CapsulePayload, CapsuleSummary, ExtractedCapsule } from './types'

/** localStorage — intro dismissed once per browser */
const ONBOARDING_SEEN_KEY = 'learningcapsule_onboarding_seen'
/** sessionStorage — Gemini BYOK key for this tab/session only */
const SESSION_GEMINI_KEY = 'learningcapsule_session_gemini_key'

function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function useDarkTheme(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setDark(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return dark
}

function OnboardingTour({
  onClose,
}: {
  onClose: () => void
}) {
  return (
    <div
      className="onboard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboard-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="onboard-card" onClick={(e) => e.stopPropagation()}>
        <h2 id="onboard-title">Here’s how it works</h2>
        <p className="onboard-lead">
          Short and sweet — skip if you’d rather poke around. You won’t see this again after you tap below (unless you open the
          guide from the corner).
        </p>
        <ul>
          <li>
            <strong>Paste a chat,</strong> hit <strong>Shape into draft</strong>, then tidy what came back. Tags, snippets, notes —
            it’s yours to edit.
          </li>
          <li>
            <strong>Bring your own key</strong> if you want drafts on your dime. Leave it empty if whoever runs this server already
            added one.
          </li>
          <li>
            <strong>Say something for future-you,</strong> then hit <strong>Save capsule</strong>. Old sessions live under{' '}
            <strong>Library</strong>.
          </li>
          <li>
            On a shared link, everybody sees the same library — fair warning if it’s not just you on the couch.
          </li>
          <li>
            Need a key? <code>aistudio.google.com/apikey</code>
          </li>
        </ul>
        <div className="btn-row onboard-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Skip
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Sounds good
          </button>
        </div>
      </div>
    </div>
  )
}

function SnippetEditors({
  snippets,
  onChange,
  readOnly,
  dark,
}: {
  snippets: string[]
  onChange?: (next: string[]) => void
  readOnly: boolean
  dark: boolean
}) {
  return (
    <div className="snippet-grid">
      {snippets.length === 0 && <p className="section-desc">No code pulled out yet.</p>}
      {snippets.map((code, i) => (
        <div key={i} className="snippet-cell">
          <header>
            <span>Code {i + 1}</span>
            {!readOnly && onChange && (
              <button
                type="button"
                onClick={() => onChange(snippets.filter((_, j) => j !== i))}
              >
                Remove block
              </button>
            )}
          </header>
          <Editor
            height="200px"
            theme={dark ? 'vs-dark' : 'light'}
            defaultLanguage="python"
            language="python"
            value={code}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 8, bottom: 8 },
            }}
            onChange={(value) => {
              if (!readOnly && onChange) {
                const next = [...snippets]
                next[i] = value ?? ''
                onChange(next)
              }
            }}
          />
        </div>
      ))}
      {!readOnly && onChange && (
        <button type="button" className="btn-secondary" onClick={() => onChange([...snippets, ''])}>
          Add another block
        </button>
      )}
    </div>
  )
}

function CreateFlow({
  dark,
  setError,
  setSuccess,
}: {
  dark: boolean
  setError: (s: string | null) => void
  setSuccess: (s: string | null) => void
}) {
  const [rawText, setRawText] = useState('')
  const [geminiKey, setGeminiKey] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      return sessionStorage.getItem(SESSION_GEMINI_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [draft, setDraft] = useState<ExtractedCapsule | null>(null)
  const [busy, setBusy] = useState(false)
  const [moduleLabel, setModuleLabel] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [questionsText, setQuestionsText] = useState('')
  const [conclusionsText, setConclusionsText] = useState('')
  const [commentaryText, setCommentaryText] = useState('')
  const [keyTakeaway, setKeyTakeaway] = useState('')
  const [notesToSelf, setNotesToSelf] = useState('')
  const [struggles, setStruggles] = useState('')

  useEffect(() => {
    try {
      if (geminiKey.trim()) sessionStorage.setItem(SESSION_GEMINI_KEY, geminiKey)
      else sessionStorage.removeItem(SESSION_GEMINI_KEY)
    } catch {
      /* noop */
    }
  }, [geminiKey])

  const syncListsFromDraft = useCallback((d: ExtractedCapsule) => {
    setTagsInput(d.tags.join(', '))
    setQuestionsText(d.questions.join('\n'))
    setConclusionsText(d.my_conclusions.join('\n'))
    setCommentaryText(d.user_commentary.join('\n'))
  }, [])

  const handleExtract = async () => {
    setError(null)
    setSuccess(null)
    if (!rawText.trim()) {
      setError('Drop in some chat text first.')
      return
    }
    setBusy(true)
    try {
      const ex = await extractCapsule(rawText, { geminiKey: geminiKey.trim() || undefined })
      setDraft(ex)
      syncListsFromDraft(ex)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const updateDraft = (patch: Partial<ExtractedCapsule>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : null))
  }

  const handleCommit = async () => {
    setError(null)
    setSuccess(null)
    if (!draft) return
    const payload: CapsulePayload = {
      ...draft,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      questions: linesToArray(questionsText),
      my_conclusions: linesToArray(conclusionsText),
      user_commentary: linesToArray(commentaryText),
      module_label: moduleLabel,
      key_takeaway: keyTakeaway,
      notes_to_self: notesToSelf,
      struggles_feedback: struggles,
    }
    setBusy(true)
    try {
      const res = await commitCapsule(payload)
      setSuccess(`Nice — saved. You’ll find it under Library. (${res.filename})`)
      setDraft(null)
      setRawText('')
      setModuleLabel('')
      setKeyTakeaway('')
      setNotesToSelf('')
      setStruggles('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setRawText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  return (
    <div>
      <section className="section">
        <h2 className="section-title">Start with the chat</h2>
        <p className="section-desc">Paste the thread, or grab a file (.txt, .md, etc.).</p>
        <div className="field">
          <label htmlFor="gemini-key">Optional: your API key</label>
          <p className="section-desc subtle">
            Only sent when you shape a draft — never stored on this server. Keeps this browser tab only; close the tab and it’s
            gone. Skip if the host already wired one up.
          </p>
          <input
            id="gemini-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Your key, or leave empty"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
        </div>
        <textarea
          className="raw-import"
          placeholder="Your chat goes here…"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <div className="btn-row">
          <input
            type="file"
            accept=".txt,.md,.json,text/plain,text/markdown,application/json"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button type="button" className="btn-primary" disabled={busy || !rawText.trim()} onClick={handleExtract}>
            {busy ? 'One moment…' : 'Shape into draft'}
          </button>
        </div>
      </section>

      {draft && (
        <>
          <section className="section">
            <h2 className="section-title">Tidy the draft</h2>
            <p className="section-desc">You know the session better than anyone — nudge anything that feels off.</p>
            <div className="field-row">
              <div className="field">
                <label htmlFor="module">Course / module</label>
                <input
                  id="module"
                  type="text"
                  placeholder="e.g. Boot.dev — linked lists"
                  value={moduleLabel}
                  onChange={(e) => setModuleLabel(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  value={draft.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="tags">Tags</label>
              <input id="tags" type="text" placeholder="python, testing, …" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="main">What it was about</label>
              <textarea id="main" rows={4} value={draft.main_idea} onChange={(e) => updateDraft({ main_idea: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="questions">Questions (one per line)</label>
                <textarea id="questions" rows={6} value={questionsText} onChange={(e) => setQuestionsText(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="conclusions">What clicked (one per line)</label>
                <textarea id="conclusions" rows={6} value={conclusionsText} onChange={(e) => setConclusionsText(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="commentary">Side notes from the chat</label>
              <textarea id="commentary" rows={4} value={commentaryText} onChange={(e) => setCommentaryText(e.target.value)} />
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Code</h2>
            <p className="section-desc">Edit in place, trim, or add blocks as you like.</p>
            <SnippetEditors
              dark={dark}
              readOnly={false}
              snippets={draft.code_snippets}
              onChange={(next) => updateDraft({ code_snippets: next })}
            />
          </section>

          <section className="section">
            <h2 className="section-title">Your voice</h2>
            <p className="section-desc">The part only you can write.</p>
            <div className="field">
              <label htmlFor="takeaway">TL;DR</label>
              <textarea id="takeaway" rows={3} placeholder="If you remembered one line…" value={keyTakeaway} onChange={(e) => setKeyTakeaway(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="notes">Notes to future you</label>
              <textarea id="notes" rows={3} placeholder="Anything you wish you’d written down sooner" value={notesToSelf} onChange={(e) => setNotesToSelf(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="struggles">What slowed you down</label>
              <textarea id="struggles" rows={3} placeholder="Honesty welcome" value={struggles} onChange={(e) => setStruggles(e.target.value)} />
            </div>
            <button type="button" className="btn-primary" disabled={busy} onClick={handleCommit}>
              Save capsule
            </button>
          </section>
        </>
      )}

      {!draft && (
        <p className="section-desc loading-hint">Shape a draft first — then you can tweak and save.</p>
      )}
    </div>
  )
}

function ViewFlow({
  dark,
  setError,
}: {
  dark: boolean
  setError: (s: string | null) => void
}) {
  const [list, setList] = useState<CapsuleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [doc, setDoc] = useState<CapsuleDocument | null>(null)

  const refreshList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const rows = await listCapsules()
      setList(rows)
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.capsule_id === prev)) return prev
        return rows[0]?.capsule_id ?? ''
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => {
    startTransition(() => {
      void refreshList()
    })
  }, [refreshList])

  useEffect(() => {
    if (!selectedId) return
    const id = selectedId
    let cancelled = false
    startTransition(() => {
      void (async () => {
        try {
          const d = await getCapsule(id)
          if (!cancelled) setDoc(d)
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e))
        }
      })()
    })
    return () => {
      cancelled = true
    }
  }, [selectedId, setError])

  const displayDoc = selectedId && doc?.capsule_id === selectedId ? doc : null

  return (
    <div>
      <div className="btn-row">
        <button type="button" className="btn-secondary" onClick={refreshList} disabled={loading}>
          Refresh
        </button>
      </div>
      {loading && <p className="loading-hint">Fetching…</p>}
      {!loading && list.length === 0 && <p className="section-desc">Nothing saved yet — start something under New.</p>}
      {!loading && list.length > 0 && (
        <>
          <select
            className="view-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {list.map((row) => (
              <option key={row.capsule_id} value={row.capsule_id}>
                {row.date} — {row.title || '(untitled)'} ({row.filename})
              </option>
            ))}
          </select>

          {displayDoc && (
            <>
              <div className="view-panel">
                <h3>{displayDoc.title || '(untitled)'}</h3>
                <dl>
                  <dt>Id</dt>
                  <dd>{displayDoc.capsule_id}</dd>
                  <dt>Calendar date</dt>
                  <dd>{displayDoc.date}</dd>
                  <dt>Saved at</dt>
                  <dd>{displayDoc.created_at}</dd>
                  <dt>Course</dt>
                  <dd>{displayDoc.module_label || '—'}</dd>
                  <dt>Tags</dt>
                  <dd>{displayDoc.tags.length ? displayDoc.tags.join(', ') : '—'}</dd>
                  <dt>What it was about</dt>
                  <dd>{displayDoc.main_idea || '—'}</dd>
                  <dt>Questions</dt>
                  <dd>{displayDoc.questions.length ? displayDoc.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : '—'}</dd>
                  <dt>What clicked</dt>
                  <dd>{displayDoc.my_conclusions.length ? displayDoc.my_conclusions.join('\n') : '—'}</dd>
                  <dt>Side notes</dt>
                  <dd>{displayDoc.user_commentary.length ? displayDoc.user_commentary.join('\n') : '—'}</dd>
                  <dt>TL;DR</dt>
                  <dd>{displayDoc.key_takeaway || '—'}</dd>
                  <dt>Notes to future you</dt>
                  <dd>{displayDoc.notes_to_self || '—'}</dd>
                  <dt>What was hard</dt>
                  <dd>{displayDoc.struggles_feedback || '—'}</dd>
                </dl>
              </div>
              <h2 className="section-title">Code</h2>
              <SnippetEditors dark={dark} readOnly snippets={displayDoc.code_snippets} />
            </>
          )}
        </>
      )}
    </div>
  )
}

export default function App() {
  const dark = useDarkTheme()
  const [mainTab, setMainTab] = useState<'create' | 'view'>('create')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(ONBOARDING_SEEN_KEY) !== '1'
    } catch {
      return true
    }
  })

  const closeOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    } catch {
      /* noop */
    }
    setShowOnboarding(false)
  }

  const reopenGuide = () => {
    setShowOnboarding(true)
  }

  return (
    <>
      {showOnboarding && <OnboardingTour onClose={closeOnboarding} />}

      <header className="app-header">
        <div className="app-header-row">
          <div className="app-header-text">
            <h1>LearningCapsule</h1>
            <p>
              Turn a sprawling tutoring chat into a note you’ll actually open later — then file it away when you’re happy with
              it.
            </p>
          </div>
          <button type="button" className="btn-link" onClick={reopenGuide}>
            Guide
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button type="button" className={mainTab === 'create' ? 'active' : ''} onClick={() => setMainTab('create')}>
          New
        </button>
        <button type="button" className={mainTab === 'view' ? 'active' : ''} onClick={() => setMainTab('view')}>
          Library
        </button>
      </nav>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="success-banner" role="status">
          {success}
        </div>
      )}

      {mainTab === 'create' && (
        <CreateFlow dark={dark} setError={setError} setSuccess={setSuccess} />
      )}
      {mainTab === 'view' && <ViewFlow dark={dark} setError={setError} />}
    </>
  )
}
