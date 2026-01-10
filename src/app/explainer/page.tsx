'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Select, Textarea } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

interface SavedExplanation {
  id: string
  topic: string
  grade_level: string
  explanation_data: ExplanationData
  created_at: string
}

const gradeLevels = [
  { value: 'elementary', label: 'Elementary School (Grades 3-5)' },
  { value: 'middle', label: 'Middle School (Grades 6-8)' },
  { value: 'high', label: 'High School (Grades 9-12)' },
]

interface ExplanationData {
  mainPoints: string[]
  detailedPoints: string[]
  realWorldExamples: string[]
  analogy: string
  keyTerms: { term: string; meaning: string }[]
  studyTips: string[]
  commonTricks: string[]
  quickReview: string[]
}

export default function ExplainerPage() {
  const [gradeLevel, setGradeLevel] = useState('high')
  const [topic, setTopic] = useState('')
  const [explanationData, setExplanationData] = useState<ExplanationData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<SavedExplanation[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [explainOutLoudPrompt, setExplainOutLoudPrompt] = useState<string>('')
  const [explainOutLoudLoading, setExplainOutLoudLoading] = useState(false)
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
          .eq('feature_type', 'explainer')
          .order('created_at', { ascending: false })
          .limit(20)

        if (!fetchError && data) {
          const parsed: SavedExplanation[] = data
            .map(item => {
              try {
                return {
                  id: item.id,
                  topic: item.input_text,
                  grade_level: item.subject || 'high',
                  explanation_data: JSON.parse(item.output_text),
                  created_at: item.created_at,
                }
              } catch {
                return null
              }
            })
            .filter((item): item is SavedExplanation => item !== null)
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

  // Save explanation to Supabase
  const saveExplanation = async (topicText: string, data: ExplanationData, grade: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data: inserted, error: insertError } = await supabase
        .from('study_sessions')
        .insert({
          user_id: session.user.id,
          feature_type: 'explainer',
          subject: grade,
          input_text: topicText,
          output_text: JSON.stringify(data),
        })
        .select()
        .single()

      if (!insertError && inserted) {
        const newItem: SavedExplanation = {
          id: inserted.id,
          topic: topicText,
          grade_level: grade,
          explanation_data: data,
          created_at: inserted.created_at,
        }
        setHistory(prev => [newItem, ...prev])
        setSelectedHistoryId(inserted.id)
      }
    } catch {
      // Silently fail if save doesn't work
    }
  }

  // Load a saved explanation
  const loadFromHistory = (item: SavedExplanation) => {
    setTopic(item.topic)
    setGradeLevel(item.grade_level)
    setExplanationData(item.explanation_data)
    setSelectedHistoryId(item.id)
    setError('')
    setExplainOutLoudPrompt('')
    // Generate explain out loud prompt automatically
    generateExplainOutLoudPrompt(item.topic, item.explanation_data.mainPoints || [], item.grade_level)
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

  const parseExplanation = (response: string): ExplanationData => {
    // Handle undefined or non-string responses
    if (!response || typeof response !== 'string') {
      return {
        mainPoints: [],
        detailedPoints: [],
        realWorldExamples: [],
        analogy: '',
        keyTerms: [],
        studyTips: [],
        commonTricks: [],
        quickReview: []
      }
    }

    const cleanResponse = response
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,3}\s*/g, '')
      .trim()

    const data: ExplanationData = {
      mainPoints: [],
      detailedPoints: [],
      realWorldExamples: [],
      analogy: '',
      keyTerms: [],
      studyTips: [],
      commonTricks: [],
      quickReview: []
    }

    const lines = cleanResponse.split('\n')
    let currentSection = ''
    let currentContent: string[] = []

    const saveCurrentSection = () => {
      const content = currentContent.join(' ').trim()
      const listItems = currentContent
        .filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+[.)]/))
        .map(l => l.replace(/^[-•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
        .filter(l => l.length > 0)

      switch (currentSection) {
        case 'main':
          data.mainPoints = listItems.length > 0 ? listItems : content.split(/[.!?]/).filter(s => s.trim().length > 10).map(s => s.trim()).slice(0, 3)
          break
        case 'detailed':
          data.detailedPoints = listItems.length > 0 ? listItems : content.split(/[.!?]/).filter(s => s.trim().length > 15).map(s => s.trim())
          break
        case 'examples':
          data.realWorldExamples = listItems.length > 0 ? listItems : [content]
          break
        case 'analogy':
          data.analogy = content.replace(/^[-•]\s*/gm, '').replace(/^\d+[.)]\s*/gm, '')
          break
        case 'terms':
          for (const line of currentContent) {
            const termMatch = line.match(/^[-•]?\s*([^:–-]+)[:\s–-]+(.+)/)
            if (termMatch) {
              data.keyTerms.push({ term: termMatch[1].trim(), meaning: termMatch[2].trim() })
            }
          }
          break
        case 'study':
          data.studyTips = listItems.length > 0 ? listItems : content.split(/[.!]/).filter(s => s.trim().length > 10).map(s => s.trim())
          break
        case 'tricks':
          data.commonTricks = listItems.length > 0 ? listItems : content.split(/[.!]/).filter(s => s.trim().length > 10).map(s => s.trim())
          break
        case 'review':
          data.quickReview = listItems.length > 0 ? listItems : content.split(/[.!]/).filter(s => s.trim().length > 10).map(s => s.trim())
          break
      }
      currentContent = []
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const mainMatch = trimmed.match(/^(?:Main Idea|Main Point|The Big Picture|Key Takeaway)[:\s]*(.*)/i)
      const detailedMatch = trimmed.match(/^(?:Detailed Explanation|More Detail|Breaking It Down|Full Explanation|Simple Definition|In Simple Terms)[:\s]*(.*)/i)
      const examplesMatch = trimmed.match(/^(?:Real[- ]?World Examples?|Examples?|In Real Life)[:\s]*(.*)/i)
      const analogyMatch = trimmed.match(/^(?:Analogy|Think Of It Like|Easy Way To Remember)[:\s]*(.*)/i)
      const termsMatch = trimmed.match(/^(?:Key Terms?|Important (?:Words|Terms|Vocabulary))[:\s]*(.*)/i)
      const studyMatch = trimmed.match(/^(?:Study Tips?|How To Study|Ways To Learn|Study Strategies)[:\s]*(.*)/i)
      const tricksMatch = trimmed.match(/^(?:Common (?:Tricks|Mistakes|Misconceptions)|Watch Out For|Teacher Tricks|Tricky Parts?)[:\s]*(.*)/i)
      const reviewMatch = trimmed.match(/^(?:Quick Review|Remember|Key (?:Points?|Takeaways?))[:\s]*(.*)/i)

      if (mainMatch) {
        saveCurrentSection()
        currentSection = 'main'
        if (mainMatch[1]) currentContent.push(mainMatch[1])
      } else if (detailedMatch) {
        saveCurrentSection()
        currentSection = 'detailed'
        if (detailedMatch[1]) currentContent.push(detailedMatch[1])
      } else if (examplesMatch) {
        saveCurrentSection()
        currentSection = 'examples'
        if (examplesMatch[1]) currentContent.push(examplesMatch[1])
      } else if (analogyMatch) {
        saveCurrentSection()
        currentSection = 'analogy'
        if (analogyMatch[1]) currentContent.push(analogyMatch[1])
      } else if (termsMatch) {
        saveCurrentSection()
        currentSection = 'terms'
        if (termsMatch[1]) currentContent.push(termsMatch[1])
      } else if (studyMatch) {
        saveCurrentSection()
        currentSection = 'study'
        if (studyMatch[1]) currentContent.push(studyMatch[1])
      } else if (tricksMatch) {
        saveCurrentSection()
        currentSection = 'tricks'
        if (tricksMatch[1]) currentContent.push(tricksMatch[1])
      } else if (reviewMatch) {
        saveCurrentSection()
        currentSection = 'review'
        if (reviewMatch[1]) currentContent.push(reviewMatch[1])
      } else {
        currentContent.push(trimmed)
      }
    }
    saveCurrentSection()

    // Fallback: if we didn't parse sections, create from full text
    if (data.mainPoints.length === 0 && data.detailedPoints.length === 0) {
      const paragraphs = cleanResponse.split(/\n\n+/).filter(p => p.trim())
      if (paragraphs.length >= 1) {
        data.mainPoints = paragraphs[0].split(/[.!?]/).filter(s => s.trim().length > 10).map(s => s.trim()).slice(0, 3)
      }
      if (paragraphs.length >= 2) {
        data.detailedPoints = paragraphs.slice(1).flatMap(p =>
          p.split(/[.!?]/).filter(s => s.trim().length > 15).map(s => s.trim())
        )
      }
    }

    return data
  }

  const handleExplain = async () => {
    if (!topic.trim()) {
      setError('Please enter a concept or topic to explain')
      return
    }

    setLoading(true)
    setError('')
    setExplanationData(null)
    setExplainOutLoudPrompt('')

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'explainer',
          input: `Explain "${topic}" for a ${gradeLevel === 'elementary' ? 'elementary school (grades 3-5)' : gradeLevel === 'middle' ? 'middle school (grades 6-8)' : 'high school (grades 9-12)'} student using this EXACT format:

Main Idea:
- [Most important thing to know - one short sentence]
- [Second key point - one short sentence]
- [Third key point if needed - one short sentence]

Breaking It Down:
- [Key point 1 explaining a core part of the concept]
- [Key point 2 with another important aspect]
- [Key point 3 breaking down more details]
- [Key point 4 if needed]
- [Key point 5 if needed]

Real-World Examples:
- [Example 1 that students can relate to]
- [Example 2 from everyday life]
- [Example 3 showing practical application]

Analogy:
[A creative comparison that makes the concept easy to remember, like "Think of it like..."]

Key Terms:
- [Term 1]: [Simple definition]
- [Term 2]: [Simple definition]
- [Term 3]: [Simple definition]

Study Tips:
- [Tip 1 for remembering this concept]
- [Tip 2 for studying effectively]
- [Tip 3 for practice]

Common Tricks (Watch Out!):
- [Mistake 1 teachers often test on or students commonly make]
- [Mistake 2 or tricky question type]
- [Mistake 3 or misconception to avoid]

Quick Review:
- [Key point 1 to remember]
- [Key point 2 to remember]
- [Key point 3 to remember]`,
          gradeLevel,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to explain concept')
      }

      const parsedData = parseExplanation(data.response)
      setExplanationData(parsedData)
      setSelectedHistoryId(null)

      // Save to Supabase
      await saveExplanation(topic, parsedData, gradeLevel)

      // Generate explain out loud prompt automatically
      generateExplainOutLoudPrompt(topic, parsedData.mainPoints, gradeLevel)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSimplify = async () => {
    if (!explanationData) return

    setLoading(true)
    setError('')

    try {
      const currentContent = `${(explanationData.mainPoints ?? []).join('\n')}\n\n${(explanationData.detailedPoints ?? []).join('\n')}`
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'explainer',
          input: `Make this explanation even simpler for a younger student. Use very simple words and fun comparisons:

Main Idea:
- [Most important thing - very simple]
- [Second point - very simple]

Breaking It Down:
- [Simple point 1]
- [Simple point 2]
- [Simple point 3]

Real-World Examples:
- [Simple example 1]
- [Simple example 2]

Analogy:
[A fun, easy comparison]

Key Terms:
- [Term]: [Very simple meaning]

Study Tips:
- [Easy tip 1]
- [Easy tip 2]

Common Tricks (Watch Out!):
- [Simple warning 1]
- [Simple warning 2]

Quick Review:
- [Main thing to remember]

Original content to simplify:
${currentContent}`,
          gradeLevel: 'elementary',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to simplify')
      }

      setExplanationData(parseExplanation(data.response))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Generate explain out loud prompt
  const generateExplainOutLoudPrompt = async (topicText: string, mainPoints: string[], grade: string) => {
    setExplainOutLoudLoading(true)

    try {
      const pointsText = mainPoints?.join(', ') || ''
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'explainer',
          input: `Create a short, friendly prompt (2-3 sentences max) that a ${grade === 'elementary' ? 'elementary school' : grade === 'middle' ? 'middle school' : 'high school'} student can use to explain "${topicText}" out loud to themselves or a friend.

The main points they should cover are: ${pointsText}

Make it conversational and encouraging, like "Try explaining to a friend that..." or "Pretend you're teaching someone about...". Don't include bullet points or lists - just a natural prompt they can follow.`,
          gradeLevel: grade,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate prompt')
      }

      // Clean up the response
      const cleanedResponse = data.response
        ?.replace(/\*\*/g, '')
        ?.replace(/\*/g, '')
        ?.replace(/#{1,3}\s*/g, '')
        ?.trim() || 'Try explaining this concept in your own words!'

      setExplainOutLoudPrompt(cleanedResponse)
    } catch (err) {
      console.error('Error generating explain out loud prompt:', err)
      setExplainOutLoudPrompt('Try explaining this concept in your own words to really lock it in!')
    } finally {
      setExplainOutLoudLoading(false)
    }
  }

  return (
    <div className="relative">
      {/* History Toggle Button */}
      {history.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`fixed top-24 right-4 z-40 px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2 ${
            showHistory
              ? 'bg-accent-purple text-white'
              : 'bg-bg-card border border-border-default text-text-secondary hover:text-accent-purple hover:border-accent-purple/50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">History</span>
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
            showHistory ? 'bg-white/20 text-white' : 'bg-accent-purple text-white'
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
          <div className="fixed top-20 right-4 w-80 max-h-[calc(100vh-120px)] z-40 animate-in slide-in-from-right duration-200">
            <Card className="p-4 shadow-xl border-accent-purple/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-text-primary flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recent Explanations
                </h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded hover:bg-bg-secondary text-text-muted"
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
                          ? 'bg-accent-purple/20 border border-accent-purple/30'
                          : 'bg-bg-secondary hover:bg-bg-elevated border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${
                            selectedHistoryId === item.id ? 'text-accent-purple' : 'text-text-primary'
                          }`}>
                            {item.topic}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatDate(item.created_at)}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
                              {item.grade_level === 'elementary' ? 'Elem' : item.grade_level === 'middle' ? 'Middle' : 'High'}
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
          <h1 className="text-3xl font-bold text-text-primary">Concept Explainer</h1>

          <div className="flex items-center gap-3">
            {/* New explanation button */}
            {(explanationData || selectedHistoryId) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTopic('')
                  setExplanationData(null)
                  setSelectedHistoryId(null)
                  setError('')
                }}
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New
              </Button>
            )}
          </div>
        </div>

        <Card className="overflow-hidden border-2 border-border-default hover:border-accent-purple/30 transition-colors duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-accent-purple/10 to-transparent px-6 py-4 border-b border-border-default">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-purple/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">What would you like to understand?</h2>
                <p className="text-sm text-text-muted">Enter a topic or paste confusing text for a clear explanation</p>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-6">
            <Select
              label="Explanation Level"
              options={gradeLevels}
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              }
            />

            <Textarea
              label="Topic or Text"
              placeholder="Enter what you want explained...

Examples:
• What is photosynthesis?
• Explain the causes of World War I
• Or paste a confusing paragraph from your textbook"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={5}
              hint="We&apos;ll break it down with examples, analogies, and study tips"
              error={error}
            />

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Powered by AI</span>
              </div>
              <Button onClick={handleExplain} loading={loading} className="px-8">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Explain This
              </Button>
            </div>
          </div>
        </Card>

      {explanationData && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-purple/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-text-primary">{topic}</h2>
            </div>
            <Button variant="secondary" size="sm" onClick={handleSimplify} loading={loading}>
              Make it Simpler
            </Button>
          </div>

          {/* Main Idea - Key Points Box */}
          {explanationData.mainPoints?.length > 0 && (
            <Card className="bg-gradient-to-br from-accent-green/15 to-accent-teal/10 border-accent-green/30">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-accent-green text-lg">Main Idea</h3>
                </div>
                <div className="space-y-2">
                  {explanationData.mainPoints.map((point, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-accent-green flex-shrink-0 mt-2"></span>
                      <p className="text-text-primary leading-relaxed">{point}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Breaking It Down - Numbered Points */}
          {explanationData.detailedPoints?.length > 0 && (
            <Card>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-blue/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-text-primary text-lg">Breaking It Down</h3>
                </div>
                <div className="space-y-3">
                  {explanationData.detailedPoints.map((point, index) => (
                    <div key={index} className="flex items-start gap-3 bg-bg-secondary/50 rounded-lg p-4">
                      <span className="w-8 h-8 rounded-lg bg-accent-blue/20 flex items-center justify-center flex-shrink-0 text-accent-blue font-bold">
                        {index + 1}
                      </span>
                      <p className="text-text-primary leading-relaxed pt-1">{point}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Real World Examples */}
          {explanationData.realWorldExamples?.length > 0 && (
            <Card className="bg-accent-green/5 border-accent-green/20">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-text-primary text-lg">Real-World Examples</h3>
                </div>
                <div className="grid gap-3">
                  {explanationData.realWorldExamples.map((example, index) => (
                    <div key={index} className="flex items-start gap-3 bg-bg-secondary/50 rounded-lg p-4">
                      <span className="w-6 h-6 rounded-full bg-accent-green/20 flex items-center justify-center flex-shrink-0 text-accent-green text-sm font-medium">
                        {index + 1}
                      </span>
                      <p className="text-text-primary leading-relaxed">{example}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Analogy */}
          {explanationData.analogy && (
            <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-amber-500 mb-2">Think of it Like...</h3>
                  <p className="text-text-primary leading-relaxed">{explanationData.analogy}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Key Terms */}
          {explanationData.keyTerms?.length > 0 && (
            <Card>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-purple/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-text-primary text-lg">Key Terms to Know</h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {explanationData.keyTerms.map((item, index) => (
                    <div key={index} className="bg-bg-secondary rounded-lg p-4">
                      <span className="inline-block px-3 py-1 bg-accent-purple/20 text-accent-purple rounded-full font-medium text-sm mb-2">
                        {item.term}
                      </span>
                      <p className="text-text-primary text-sm leading-relaxed">{item.meaning}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Study Tips */}
          {explanationData.studyTips?.length > 0 && (
            <Card className="bg-accent-blue/5 border-accent-blue/20">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-blue/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-text-primary text-lg">How to Study This</h3>
                </div>
                <div className="space-y-2">
                  {explanationData.studyTips.map((tip, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-accent-blue/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-text-primary leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Common Tricks - Warning Card */}
          {explanationData.commonTricks?.length > 0 && (
            <Card className="bg-error/5 border-error/20">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-error/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-error text-lg">Watch Out! Common Tricks</h3>
                    <p className="text-text-muted text-sm">Things teachers might test you on or mistakes to avoid</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {explanationData.commonTricks.map((trick, index) => (
                    <div key={index} className="flex items-start gap-3 bg-error/10 rounded-lg p-4">
                      <svg className="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-text-primary">{trick}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Quick Review */}
          {explanationData.quickReview?.length > 0 && (
            <Card className="bg-accent-green/10 border-accent-green/30">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-accent-green text-lg">Quick Review - Remember This!</h3>
                </div>
                <div className="space-y-2">
                  {explanationData.quickReview.map((point, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-accent-green text-bg-primary flex items-center justify-center flex-shrink-0 text-sm font-bold">
                        {index + 1}
                      </span>
                      <p className="text-text-primary font-medium">{point}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Test Yourself - Interactive Challenge */}
          <Card className="bg-gradient-to-br from-accent-teal/10 to-accent-blue/10 border-accent-teal/30">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-teal/30 to-accent-blue/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-accent-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-text-primary text-xl">Test Yourself!</h3>
                  <p className="text-text-muted text-sm">Challenge yourself to make sure you really understand</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-bg-primary/50 rounded-xl p-4 border border-accent-teal/20">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-accent-teal/20 flex items-center justify-center text-accent-teal text-sm font-bold">1</span>
                    <span className="text-accent-teal font-semibold text-sm">Explain Out Loud</span>
                  </div>
                  {explainOutLoudLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-accent-teal/30 border-t-accent-teal rounded-full animate-spin"></div>
                      <span className="text-text-muted text-sm">Generating prompt...</span>
                    </div>
                  ) : (
                    <p className="text-text-primary text-sm leading-relaxed">{explainOutLoudPrompt || `Try explaining ${topic} in your own words!`}</p>
                  )}
                </div>

                <div className="bg-bg-primary/50 rounded-xl p-4 border border-accent-blue/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue text-sm font-bold">2</span>
                    <span className="text-accent-blue font-semibold text-sm">Write It Down</span>
                  </div>
                  <p className="text-text-secondary text-sm">Write a quick summary in your own words - this helps lock it into memory</p>
                </div>

                <div className="bg-bg-primary/50 rounded-xl p-4 border border-accent-purple/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-accent-purple/20 flex items-center justify-center text-accent-purple text-sm font-bold">3</span>
                    <span className="text-accent-purple font-semibold text-sm">Find Examples</span>
                  </div>
                  <p className="text-text-secondary text-sm">Think of your own real-world examples that weren&apos;t mentioned above</p>
                </div>
              </div>

              <div className="bg-accent-teal/10 rounded-xl p-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-accent-teal flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-accent-teal text-sm"><span className="font-semibold">Pro tip:</span> If you can teach it to someone else, you truly understand it!</p>
              </div>
            </div>
          </Card>
        </div>
      )}
      </div>
    </div>
  )
}
