import { startTransition, useCallback, useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import './App.css'
import { commitCapsule, extractCapsule, getCapsule, listCapsules } from './api'
import type { CapsuleDocument, CapsulePayload, CapsuleSummary, ExtractedCapsule } from './types'

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
      {snippets.length === 0 && <p className="section-desc">No code snippets.</p>}
      {snippets.map((code, i) => (
        <div key={i} className="snippet-cell">
          <header>
            <span>Snippet {i + 1}</span>
            {!readOnly && onChange && (
              <button
                type="button"
                onClick={() => onChange(snippets.filter((_, j) => j !== i))}
              >
                Remove
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
          Add snippet
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
      setError('Paste or upload a chat export first.')
      return
    }
    setBusy(true)
    try {
      const ex = await extractCapsule(rawText)
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
      setSuccess(`Saved capsule ${res.capsule_id} (${res.filename})`)
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
        <h2>1. Import chat export</h2>
        <p className="section-desc">
          Paste raw text from a Gemini (or other) export, or load a <code>.txt</code> / <code>.md</code> file.
        </p>
        <textarea
          className="raw-import"
          placeholder="Paste chat export here…"
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
            {busy ? 'Working…' : 'Extract with Gemini'}
          </button>
        </div>
      </section>

      {draft && (
        <>
          <section className="section">
            <h2>2. Validate organized data</h2>
            <div className="field-row">
              <div className="field">
                <label htmlFor="module">Module / course label</label>
                <input
                  id="module"
                  type="text"
                  placeholder="e.g. Boot.dev — Linked Lists"
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
              <label htmlFor="tags">Tags (comma-separated)</label>
              <input id="tags" type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="main">Main idea</label>
              <textarea id="main" rows={4} value={draft.main_idea} onChange={(e) => updateDraft({ main_idea: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="questions">Questions (one per line)</label>
                <textarea id="questions" rows={6} value={questionsText} onChange={(e) => setQuestionsText(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="conclusions">My conclusions (one per line)</label>
                <textarea id="conclusions" rows={6} value={conclusionsText} onChange={(e) => setConclusionsText(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="commentary">User commentary from chat (one per line)</label>
              <textarea id="commentary" rows={4} value={commentaryText} onChange={(e) => setCommentaryText(e.target.value)} />
            </div>
          </section>

          <section className="section">
            <h2>3. Code snippets</h2>
            <p className="section-desc">Edit in place or add/remove blocks — displayed side by side.</p>
            <SnippetEditors
              dark={dark}
              readOnly={false}
              snippets={draft.code_snippets}
              onChange={(next) => updateDraft({ code_snippets: next })}
            />
          </section>

          <section className="section">
            <h2>4. Enrich — your voice</h2>
            <div className="field">
              <label htmlFor="takeaway">Key takeaway</label>
              <textarea id="takeaway" rows={3} value={keyTakeaway} onChange={(e) => setKeyTakeaway(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="notes">Notes to self</label>
              <textarea id="notes" rows={3} value={notesToSelf} onChange={(e) => setNotesToSelf(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="struggles">Struggles / honest feedback</label>
              <textarea id="struggles" rows={3} value={struggles} onChange={(e) => setStruggles(e.target.value)} />
            </div>
            <button type="button" className="btn-primary" disabled={busy} onClick={handleCommit}>
              Commit time capsule
            </button>
          </section>
        </>
      )}

      {!draft && (
        <p className="section-desc loading-hint">Run extraction to unlock validation, snippets, and enrichment.</p>
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
          Refresh list
        </button>
      </div>
      {loading && <p className="loading-hint">Loading…</p>}
      {!loading && list.length === 0 && <p className="section-desc">No capsules yet — create one in the other tab.</p>}
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
                  <dt>Capsule ID</dt>
                  <dd>{displayDoc.capsule_id}</dd>
                  <dt>Date</dt>
                  <dd>{displayDoc.date}</dd>
                  <dt>Created</dt>
                  <dd>{displayDoc.created_at}</dd>
                  <dt>Module</dt>
                  <dd>{displayDoc.module_label || '—'}</dd>
                  <dt>Tags</dt>
                  <dd>{displayDoc.tags.length ? displayDoc.tags.join(', ') : '—'}</dd>
                  <dt>Main idea</dt>
                  <dd>{displayDoc.main_idea || '—'}</dd>
                  <dt>Questions</dt>
                  <dd>{displayDoc.questions.length ? displayDoc.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : '—'}</dd>
                  <dt>My conclusions</dt>
                  <dd>{displayDoc.my_conclusions.length ? displayDoc.my_conclusions.join('\n') : '—'}</dd>
                  <dt>Commentary</dt>
                  <dd>{displayDoc.user_commentary.length ? displayDoc.user_commentary.join('\n') : '—'}</dd>
                  <dt>Key takeaway</dt>
                  <dd>{displayDoc.key_takeaway || '—'}</dd>
                  <dt>Notes to self</dt>
                  <dd>{displayDoc.notes_to_self || '—'}</dd>
                  <dt>Struggles</dt>
                  <dd>{displayDoc.struggles_feedback || '—'}</dd>
                </dl>
              </div>
              <h2>Code snippets</h2>
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

  return (
    <>
      <header className="app-header">
        <h1>LearningCapsule</h1>
        <p>
          Import a chat export, extract structure with Gemini, validate and enrich, then commit a capsule you can reopen
          later.
        </p>
      </header>

      <nav className="tabs">
        <button type="button" className={mainTab === 'create' ? 'active' : ''} onClick={() => setMainTab('create')}>
          Create capsule
        </button>
        <button type="button" className={mainTab === 'view' ? 'active' : ''} onClick={() => setMainTab('view')}>
          View capsules
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
