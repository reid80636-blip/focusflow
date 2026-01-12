'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Select, Textarea } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { generateAIResponse } from '@/lib/ai-client'

const summaryLengths = [
  { value: 'brief', label: 'Brief (2-3 sentences)' },
  { value: 'detailed', label: 'Detailed (full summary)' },
  { value: 'key-points', label: 'Key Points Only (bullet list)' },
]

interface SummaryData {
  mainIdea: string
  keyTerms: { term: string; definition: string }[]
  points: string[]
  connections: string[]
}

interface SavedSummary {
  id: string
  text_preview: string
  summary_length: string
  summary_data: SummaryData
  created_at: string
}

export default function SummarizerPage() {
  const [summaryLength, setSummaryLength] = useState('detailed')
  const [text, setText] = useState('')
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<SavedSummary[]>([])
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
          .eq('feature_type', 'summarizer')
          .order('created_at', { ascending: false })
          .limit(20)

        if (!fetchError && data) {
          const parsed: SavedSummary[] = data
            .map(item => {
              try {
                return {
                  id: item.id,
                  text_preview: item.input_text.substring(0, 100),
                  summary_length: item.subject || 'detailed',
                  summary_data: JSON.parse(item.output_text),
                  created_at: item.created_at,
                }
              } catch {
                return null
              }
            })
            .filter((item): item is SavedSummary => item !== null)
          setHistory(parsed)
        }
      } catch {
        // Silently fail if not authenticated
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [supabase])

  // Save to Supabase
  const saveSummary = async (inputText: string, data: SummaryData, length: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data: inserted, error: insertError } = await supabase
        .from('study_sessions')
        .insert({
          user_id: session.user.id,
          feature_type: 'summarizer',
          subject: length,
          input_text: inputText,
          output_text: JSON.stringify(data),
        })
        .select()
        .single()

      if (!insertError && inserted) {
        const newItem: SavedSummary = {
          id: inserted.id,
          text_preview: inputText.substring(0, 100),
          summary_length: length,
          summary_data: data,
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
  const loadFromHistory = (item: SavedSummary) => {
    setSummaryData(item.summary_data)
    setSummaryLength(item.summary_length)
    setSelectedHistoryId(item.id)
    setError('')
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

  const parseSummary = (response: string): SummaryData => {
    const cleanResponse = response
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,3}\s*/g, '')
      .trim()

    const lines = cleanResponse.split('\n').filter(l => l.trim())
    const data: SummaryData = {
      mainIdea: '',
      keyTerms: [],
      points: [],
      connections: []
    }

    let currentSection = ''

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.match(/^(?:Main Idea|Overview|Summary)[:\s]/i)) {
        currentSection = 'main'
        data.mainIdea = trimmed.replace(/^(?:Main Idea|Overview|Summary)[:\s]*/i, '')
      } else if (trimmed.match(/^(?:Key Terms?|Vocabulary|Important Terms?)[:\s]*/i)) {
        currentSection = 'terms'
      } else if (trimmed.match(/^(?:Key Points?|Main Points?|Important Points?)[:\s]*/i)) {
        currentSection = 'points'
      } else if (trimmed.match(/^(?:Connections?|How .+ Connect|Relationships?)[:\s]*/i)) {
        currentSection = 'connections'
      } else if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.match(/^\d+[.)]/)) {
        const content = trimmed.replace(/^[-•]\s*/, '').replace(/^\d+[.)]\s*/, '')

        if (currentSection === 'terms') {
          const termMatch = content.match(/^([^:–-]+)[:\s–-]+(.+)/)
          if (termMatch) {
            data.keyTerms.push({ term: termMatch[1].trim(), definition: termMatch[2].trim() })
          } else {
            data.points.push(content)
          }
        } else if (currentSection === 'connections') {
          data.connections.push(content)
        } else {
          data.points.push(content)
        }
      } else if (currentSection === 'main' && !data.mainIdea) {
        data.mainIdea = trimmed
      } else if (!currentSection && !data.mainIdea) {
        data.mainIdea = trimmed
        currentSection = 'main'
      } else if (currentSection === 'main') {
        data.mainIdea += ' ' + trimmed
      } else {
        data.points.push(trimmed)
      }
    }

    if (!data.mainIdea && data.points.length > 0) {
      data.mainIdea = data.points.shift() || ''
    }

    return data
  }

  const handleSummarize = async () => {
    if (!text.trim()) {
      setError('Please enter some text to summarize')
      return
    }

    if (text.trim().length < 100) {
      setError('Please enter more text for a meaningful summary (at least 100 characters)')
      return
    }

    setLoading(true)
    setError('')
    setSummaryData(null)
    setSelectedHistoryId(null)

    try {
      const response = await generateAIResponse({
        feature: 'summarizer',
        input: `Summarize this text with the following structure:

Main Idea: [One sentence capturing the core message]

Key Terms:
- [Term 1]: [Brief definition]
- [Term 2]: [Brief definition]
(Include 3-5 important terms from the text)

Key Points:
- [Point 1]
- [Point 2]
- [Point 3]
(List the main points)

Connections:
- [How these concepts relate to each other]

Text to summarize:
${text}`,
        summaryLength: summaryLength as 'brief' | 'detailed' | 'key-points',
      })

      const parsedData = parseSummary(response)
      setSummaryData(parsedData)

      // Save to Supabase
      await saveSummary(text, parsedData, summaryLength)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (summaryData) {
      const formattedSummary = `Main Idea: ${summaryData.mainIdea}

Key Terms:
${summaryData.keyTerms.map(t => `- ${t.term}: ${t.definition}`).join('\n')}

Key Points:
${summaryData.points.map(p => `- ${p}`).join('\n')}

Connections:
${summaryData.connections.map(c => `- ${c}`).join('\n')}`

      navigator.clipboard.writeText(formattedSummary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleNew = () => {
    setText('')
    setSummaryData(null)
    setSelectedHistoryId(null)
    setError('')
  }

  return (
    <div className="relative">
      {/* History Toggle Button */}
      {history.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`fixed top-24 right-4 z-40 px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2 ${
            showHistory
              ? 'bg-accent-green text-white'
              : 'bg-bg-card border border-border-default text-text-secondary hover:text-accent-green hover:border-accent-green/50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">History</span>
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
            showHistory ? 'bg-white/20 text-white' : 'bg-accent-green text-white'
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
            <Card className="p-4 shadow-xl border-accent-green/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-text-primary flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recent Summaries
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
                          ? 'bg-accent-green/20 border border-accent-green/30'
                          : 'bg-bg-secondary hover:bg-bg-elevated border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${
                            selectedHistoryId === item.id ? 'text-accent-green' : 'text-text-primary'
                          }`}>
                            {item.summary_data.mainIdea?.substring(0, 50) || item.text_preview.substring(0, 50)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatDate(item.created_at)}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted capitalize">
                              {item.summary_length}
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Summarizer</h1>
            <p className="text-text-secondary mt-2">
              Condense long texts into clear summaries with key terms and connections.
            </p>
          </div>

          {summaryData && (
            <Button variant="secondary" size="sm" onClick={handleNew}>
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </Button>
          )}
        </div>

        <Card className="overflow-hidden border-2 border-border-default hover:border-accent-green/30 transition-colors duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-accent-green/10 to-transparent px-6 py-4 border-b border-border-default">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Paste Your Content</h2>
                <p className="text-sm text-text-muted">We&apos;ll extract key points, terms, and connections</p>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-6">
            <Select
              label="Summary Style"
              options={summaryLengths}
              value={summaryLength}
              onChange={(e) => setSummaryLength(e.target.value)}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              }
            />

            <Textarea
              label="Your Text"
              placeholder="Paste your content here...

This works great with:
• Textbook chapters
• Articles and essays
• Class notes
• Research papers"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              error={error}
            />

            {/* Character Count Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">{text.length} characters</span>
                {text.length > 0 && text.length < 100 ? (
                  <span className="text-amber-500 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Need at least 100 characters
                  </span>
                ) : text.length >= 100 ? (
                  <span className="text-accent-green flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Ready to summarize
                  </span>
                ) : null}
              </div>
              <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    text.length >= 100 ? 'bg-accent-green' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min((text.length / 100) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Powered by AI</span>
              </div>
              <Button onClick={handleSummarize} loading={loading} disabled={text.length < 100} className="px-8">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Summarize
              </Button>
            </div>
          </div>
        </Card>

        {summaryData && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-green/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-text-primary">Summary</h2>
              </div>
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <svg className="w-4 h-4 mr-1 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy All
                  </>
                )}
              </Button>
            </div>

            {summaryData.mainIdea && (
              <Card className="bg-accent-green/10 border-accent-green/30">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-accent-green mb-1">Main Idea</h3>
                    <p className="text-text-primary leading-relaxed">{summaryData.mainIdea}</p>
                  </div>
                </div>
              </Card>
            )}

            {summaryData.keyTerms.length > 0 && (
              <Card>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-purple/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-text-primary">Key Terms</h3>
                  </div>
                  <div className="grid gap-3">
                    {summaryData.keyTerms.map((item, index) => (
                      <div key={index} className="bg-bg-secondary rounded-lg p-4">
                        <span className="inline-block px-2 py-1 bg-accent-purple/20 text-accent-purple rounded font-medium text-sm mb-2">
                          {item.term}
                        </span>
                        <p className="text-text-secondary text-sm">{item.definition}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {summaryData.points.length > 0 && (
              <Card>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-blue/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-text-primary">Key Points</h3>
                  </div>
                  <ul className="space-y-3">
                    {summaryData.points.map((point, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent-blue/20 flex items-center justify-center flex-shrink-0 text-accent-blue text-sm font-medium">
                          {index + 1}
                        </span>
                        <p className="text-text-secondary leading-relaxed">{point}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            )}

            {summaryData.connections.length > 0 && (
              <Card className="bg-amber-500/10 border-amber-500/30">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-text-primary">How It Connects</h3>
                  </div>
                  <ul className="space-y-2">
                    {summaryData.connections.map((connection, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-amber-500 mt-1">→</span>
                        <p className="text-text-secondary">{connection}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
