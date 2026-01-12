'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Select, Textarea } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

const subjects = [
  { value: '', label: 'Select a subject...' },
  { value: 'math', label: 'Math' },
  { value: 'science', label: 'Science' },
  { value: 'ela', label: 'English Language Arts' },
  { value: 'social-studies', label: 'Social Studies' },
]

const noteStyles = [
  { value: '', label: 'Select style...' },
  { value: 'outline', label: 'Outline Format' },
  { value: 'cornell', label: 'Cornell Notes' },
  { value: 'bullet', label: 'Bullet Points' },
  { value: 'summary', label: 'Summary with Key Points' },
]

interface NotesSection {
  title: string
  content: string[]
  keyTerms?: string[]
}

interface GeneratedNotes {
  title: string
  sections: NotesSection[]
  summary?: string
  keyTerms?: { term: string; definition: string }[]
}

interface SavedNotes {
  id: string
  material_preview: string
  subject: string
  notes_data: {
    notes: GeneratedNotes
    material: string
    style: string
  }
  created_at: string
}

export default function NotesPage() {
  // Form state
  const [subject, setSubject] = useState('')
  const [noteStyle, setNoteStyle] = useState('')
  const [material, setMaterial] = useState('')

  // Notes state
  const [notes, setNotes] = useState<GeneratedNotes | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'input' | 'view'>('input')

  // History state
  const [history, setHistory] = useState<SavedNotes[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const supabase = createClient()

  // Fetch history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setHistoryLoading(false)
          return
        }

        const { data, error: fetchError } = await supabase
          .from('study_sessions')
          .select('*')
          .eq('feature_type', 'notes')
          .order('created_at', { ascending: false })
          .limit(20)

        if (!fetchError && data) {
          const parsed: SavedNotes[] = data
            .map(item => {
              try {
                return {
                  id: item.id,
                  material_preview: item.input_text.substring(0, 100),
                  subject: item.subject || 'general',
                  notes_data: JSON.parse(item.output_text),
                  created_at: item.created_at,
                }
              } catch {
                return null
              }
            })
            .filter((item): item is SavedNotes => item !== null)
          setHistory(parsed)
        }
      } catch {
        // Silently fail
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [supabase])

  // Save to Supabase
  const saveNotes = async (materialText: string, generatedNotes: GeneratedNotes, subj: string, style: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const notesData = {
        notes: generatedNotes,
        material: materialText,
        style,
      }

      const { data: inserted, error: insertError } = await supabase
        .from('study_sessions')
        .insert({
          user_id: session.user.id,
          feature_type: 'notes',
          subject: subj,
          input_text: materialText,
          output_text: JSON.stringify(notesData),
        })
        .select()
        .single()

      if (!insertError && inserted) {
        const newItem: SavedNotes = {
          id: inserted.id,
          material_preview: materialText.substring(0, 100),
          subject: subj,
          notes_data: notesData,
          created_at: inserted.created_at,
        }
        setHistory(prev => [newItem, ...prev])
        setSelectedHistoryId(inserted.id)
      }
    } catch {
      // Silently fail
    }
  }

  // Load from history
  const loadFromHistory = (item: SavedNotes) => {
    setMaterial(item.notes_data.material)
    setSubject(item.subject)
    setNoteStyle(item.notes_data.style)
    setNotes(item.notes_data.notes)
    setSelectedHistoryId(item.id)
    setError('')
    setMode('view')
  }

  // Delete from history
  const deleteFromHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { error } = await supabase
        .from('study_sessions')
        .delete()
        .eq('id', id)

      if (!error) {
        setHistory(prev => prev.filter(item => item.id !== id))
        if (selectedHistoryId === id) {
          setSelectedHistoryId(null)
        }
      }
    } catch {
      // Silently fail
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const parseNotes = (response: string): GeneratedNotes => {
    const cleanResponse = response
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .trim()

    const lines = cleanResponse.split('\n').filter(l => l.trim())

    const notes: GeneratedNotes = {
      title: '',
      sections: [],
      keyTerms: [],
    }

    let currentSection: NotesSection | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // Check for title (first major heading)
      if (!notes.title && (line.startsWith('#') || i === 0)) {
        notes.title = line.replace(/^#+\s*/, '').replace(/^Title:\s*/i, '')
        continue
      }

      // Check for section headers
      const sectionMatch = line.match(/^(?:#{1,3}\s*|Section\s*\d*[:\s]*|[IVX]+\.\s*)(.+)/i)
      if (sectionMatch && !line.startsWith('-') && !line.startsWith('•')) {
        if (currentSection) {
          notes.sections.push(currentSection)
        }
        currentSection = {
          title: sectionMatch[1].trim(),
          content: [],
        }
        continue
      }

      // Check for key terms
      const termMatch = line.match(/^(?:Key Term|Term)[:\s]*(.+?)[:\s]+(.+)/i)
      if (termMatch) {
        notes.keyTerms?.push({
          term: termMatch[1].trim(),
          definition: termMatch[2].trim(),
        })
        continue
      }

      // Check for summary
      if (line.toLowerCase().startsWith('summary:')) {
        notes.summary = line.replace(/^summary:\s*/i, '')
        continue
      }

      // Add content to current section
      if (currentSection) {
        const contentLine = line
          .replace(/^[-•*]\s*/, '')
          .replace(/^\d+[.)]\s*/, '')
          .trim()
        if (contentLine) {
          currentSection.content.push(contentLine)
        }
      } else if (line && !notes.sections.length) {
        // If no section yet, create a default one
        currentSection = {
          title: 'Main Points',
          content: [line.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim()],
        }
      }
    }

    // Add final section
    if (currentSection) {
      notes.sections.push(currentSection)
    }

    // If no title was found, create one from the first section
    if (!notes.title && notes.sections.length > 0) {
      notes.title = 'Study Notes'
    }

    return notes
  }

  const getStylePrompt = (style: string): string => {
    switch (style) {
      case 'outline':
        return `Create organized study notes in OUTLINE format with:
- Clear main topics (I, II, III)
- Subtopics (A, B, C)
- Supporting details (1, 2, 3)
- Hierarchical structure`
      case 'cornell':
        return `Create study notes in CORNELL NOTE format with:
- Main notes section with key concepts
- Key terms/questions in a side column format
- A summary section at the end`
      case 'bullet':
        return `Create study notes in BULLET POINT format with:
- Concise bullet points
- Grouped by topic
- Easy to scan and review`
      case 'summary':
        return `Create study notes as a SUMMARY with KEY POINTS:
- Brief paragraph summaries
- Highlighted key concepts
- Important terms defined`
      default:
        return 'Create organized study notes'
    }
  }

  const handleGenerate = async () => {
    if (!material.trim()) {
      setError('Please enter study material or a topic')
      return
    }

    setLoading(true)
    setError('')
    setNotes(null)
    setSelectedHistoryId(null)

    const stylePrompt = getStylePrompt(noteStyle)

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'notes',
          input: `${stylePrompt}

Format the notes with clear sections like:

# Title

## Section 1: [Topic]
- Point 1
- Point 2

## Section 2: [Topic]
- Point 1
- Point 2

Key Terms:
Term: Definition

Summary: Brief overview of main points

Material to create notes from:
${material}`,
          subject,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate notes')
      }

      const parsedNotes = parseNotes(data.response)
      if (!parsedNotes.sections.length) {
        throw new Error('Could not parse notes. Please try again.')
      }

      setNotes(parsedNotes)
      setMode('view')

      // Save to Supabase
      await saveNotes(material, parsedNotes, subject, noteStyle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleNewNotes = () => {
    setMode('input')
    setNotes(null)
    setMaterial('')
    setSubject('')
    setNoteStyle('')
    setSelectedHistoryId(null)
  }

  const handleCopyNotes = () => {
    if (!notes) return

    let text = `# ${notes.title}\n\n`

    for (const section of notes.sections) {
      text += `## ${section.title}\n`
      for (const point of section.content) {
        text += `- ${point}\n`
      }
      text += '\n'
    }

    if (notes.keyTerms && notes.keyTerms.length > 0) {
      text += `## Key Terms\n`
      for (const term of notes.keyTerms) {
        text += `- ${term.term}: ${term.definition}\n`
      }
      text += '\n'
    }

    if (notes.summary) {
      text += `## Summary\n${notes.summary}\n`
    }

    navigator.clipboard.writeText(text)
  }

  return (
    <div className="relative">
      {/* History Toggle Button */}
      {history.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`fixed top-24 right-4 z-40 px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2 ${
            showHistory
              ? 'bg-teal-500 text-white'
              : 'bg-bg-card border border-border-default text-text-secondary hover:text-teal-500 hover:border-teal-500/50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">History</span>
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
            showHistory ? 'bg-white/20 text-white' : 'bg-teal-500 text-white'
          }`}>
            {history.length}
          </span>
        </button>
      )}

      {/* History Slide-out Panel */}
      {showHistory && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-30"
            onClick={() => setShowHistory(false)}
          />
          <div className="fixed top-20 right-4 w-80 max-h-[calc(100vh-120px)] z-40">
            <Card className="p-4 shadow-xl border-teal-500/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-text-primary flex items-center gap-2">
                  <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recent Notes
                </h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-4 bg-bg-elevated rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-bg-elevated rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        loadFromHistory(item)
                        setShowHistory(false)
                      }}
                      className={`group p-3 rounded-lg cursor-pointer transition-all ${
                        selectedHistoryId === item.id
                          ? 'bg-teal-500/20 border border-teal-500/30'
                          : 'bg-bg-secondary hover:bg-bg-elevated border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${
                            selectedHistoryId === item.id ? 'text-teal-500' : 'text-text-primary'
                          }`}>
                            {item.notes_data.notes.title || item.material_preview.substring(0, 50)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatDate(item.created_at)}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted capitalize">
                              {item.notes_data.style}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteFromHistory(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-error/20 text-text-muted hover:text-error transition-all"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Notes Generator</h1>
          <p className="text-text-secondary mt-2">
            Transform any content into organized, easy-to-review study notes.
          </p>
        </div>

        {/* Input Mode */}
        {mode === 'input' && (
          <Card className="overflow-hidden border-2 border-border-default hover:border-teal-500/30 transition-colors duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-500/10 to-transparent px-6 py-4 border-b border-border-default">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Generate Study Notes</h2>
                  <p className="text-sm text-text-muted">Enter a topic or paste content to create organized notes</p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="p-6 space-y-6">
              {/* Row 1: Subject & Style */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Select
                  label="Subject"
                  options={subjects}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  }
                />
                <Select
                  label="Note Style"
                  options={noteStyles}
                  value={noteStyle}
                  onChange={(e) => setNoteStyle(e.target.value)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  }
                />
              </div>

              {/* Material Input */}
              <Textarea
                label="Topic or Content"
                placeholder="Enter what you want to create notes for...

Examples:
- The causes and effects of climate change
- Chapter 5: The French Revolution
- Or paste your textbook content, lecture notes, or article here"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                rows={8}
                hint="Paste lecture notes, textbook content, or describe a topic"
                error={error}
              />

              {/* Footer */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Powered by AI</span>
                </div>
                <Button
                  onClick={handleGenerate}
                  loading={loading}
                  disabled={!subject || !noteStyle || !material.trim()}
                  className="px-8"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generate Notes
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* View Mode */}
        {mode === 'view' && notes && (
          <div className="space-y-5">
            {/* Header Actions */}
            <div className="flex items-center justify-between">
              <Button variant="secondary" size="sm" onClick={handleNewNotes}>
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Notes
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCopyNotes}>
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Notes
              </Button>
            </div>

            {/* Notes Title */}
            <Card className="border-teal-500/30 bg-gradient-to-r from-teal-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">{notes.title}</h2>
                  <p className="text-sm text-text-muted capitalize">{noteStyle} format</p>
                </div>
              </div>
            </Card>

            {/* Sections */}
            {notes.sections.map((section, index) => (
              <Card key={index} className="border-border-default">
                <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-500 flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  {section.title}
                </h3>
                <ul className="space-y-2">
                  {section.content.map((point, pointIndex) => (
                    <li key={pointIndex} className="flex items-start gap-3 text-text-secondary">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-2 flex-shrink-0" />
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}

            {/* Key Terms */}
            {notes.keyTerms && notes.keyTerms.length > 0 && (
              <Card className="border-purple-500/30">
                <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Key Terms
                </h3>
                <div className="grid gap-3">
                  {notes.keyTerms.map((item, index) => (
                    <div key={index} className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <span className="font-medium text-purple-400">{item.term}</span>
                      <span className="text-text-muted mx-2">-</span>
                      <span className="text-text-secondary">{item.definition}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Summary */}
            {notes.summary && (
              <Card className="border-accent-blue/30 bg-gradient-to-r from-accent-blue/5 to-transparent">
                <h3 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Summary
                </h3>
                <p className="text-text-secondary leading-relaxed">{notes.summary}</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
