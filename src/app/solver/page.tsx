'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Select, Textarea } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

const subjects = [
  { value: 'math', label: 'Math' },
  { value: 'science', label: 'Science' },
  { value: 'ela', label: 'English Language Arts' },
  { value: 'social-studies', label: 'Social Studies' },
]

interface Step {
  number: number
  title: string
  goal?: string
  process?: string
  result?: string
  explanation: string
  tip?: string
}

interface SolverData {
  steps: Step[]
  finalAnswer: string
}

interface SavedProblem {
  id: string
  problem: string
  subject: string
  solver_data: SolverData
  created_at: string
}

export default function SolverPage() {
  const [subject, setSubject] = useState('math')
  const [problem, setProblem] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [finalAnswer, setFinalAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'input' | 'solving' | 'complete'>('input')
  const [history, setHistory] = useState<SavedProblem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState<number[]>([])
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
          .eq('feature_type', 'solver')
          .order('created_at', { ascending: false })
          .limit(20)

        if (!fetchError && data) {
          const parsed: SavedProblem[] = data
            .map(item => {
              try {
                return {
                  id: item.id,
                  problem: item.input_text,
                  subject: item.subject || 'math',
                  solver_data: JSON.parse(item.output_text),
                  created_at: item.created_at,
                }
              } catch {
                return null
              }
            })
            .filter((item): item is SavedProblem => item !== null)
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
  const saveProblem = async (problemText: string, data: SolverData, subj: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data: inserted, error: insertError } = await supabase
        .from('study_sessions')
        .insert({
          user_id: session.user.id,
          feature_type: 'solver',
          subject: subj,
          input_text: problemText,
          output_text: JSON.stringify(data),
        })
        .select()
        .single()

      if (!insertError && inserted) {
        const newItem: SavedProblem = {
          id: inserted.id,
          problem: problemText,
          subject: subj,
          solver_data: data,
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
  const loadFromHistory = (item: SavedProblem) => {
    setProblem(item.problem)
    setSubject(item.subject)
    setSteps(item.solver_data.steps)
    setFinalAnswer(item.solver_data.finalAnswer)
    setCurrentStep(0)
    setSelectedHistoryId(item.id)
    setError('')
    setMode('solving')
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

  // Clean text by removing markdown and LaTeX symbols
  const cleanText = (text: string): string => {
    if (!text) return ''
    return text
      // Remove LaTeX boxed command
      .replace(/\\boxed\{([^}]*)\}/g, '$1')
      // Remove LaTeX text command
      .replace(/\\text\{([^}]*)\}/g, '$1')
      // Remove LaTeX frac command (convert to a/b)
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
      // Remove other common LaTeX commands
      .replace(/\\(sqrt|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv)\b/g, (_, cmd) => {
        const symbols: Record<string, string> = {
          sqrt: '√', cdot: '·', times: '×', div: '÷',
          pm: '±', mp: '∓', leq: '≤', geq: '≥',
          neq: '≠', approx: '≈', equiv: '≡'
        }
        return symbols[cmd] || ''
      })
      // Remove remaining backslash commands
      .replace(/\\[a-zA-Z]+/g, '')
      // Remove dollar signs (LaTeX math mode)
      .replace(/\$\$([^$]+)\$\$/g, '$1')
      .replace(/\$([^$]+)\$/g, '$1')
      .replace(/\$/g, '')
      // Remove bold/italic markdown markers
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*([^*\s][^*]*[^*\s]|\S)\*/g, '$1')
      .replace(/___(.+?)___/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_([^_\s][^_]*[^_\s]|\S)_/g, '$1')
      // Remove backticks
      .replace(/`([^`]+)`/g, '$1')
      // Remove curly braces left over from LaTeX
      .replace(/[{}]/g, '')
      // Remove leading bullet points and dashes
      .replace(/^[\s]*[-•]\s*/gm, '')
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  }

  const parseSteps = (response: string): { steps: Step[], answer: string } => {
    const lines = response.split('\n')
    const parsedSteps: Step[] = []
    let answer = ''
    let currentStepData: Partial<Step> | null = null
    let currentSection = ''

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      // Check for step header
      const stepMatch = trimmedLine.match(/^(?:Step\s*)?(\d+)[.:]\s*(.+)/i)
      // Check for final answer
      const answerMatch = trimmedLine.match(/^(?:Final\s*)?Answer[:\s]+(.+)/i)
      // Check for section headers
      const goalMatch = trimmedLine.match(/^Goal[:\s]+(.+)/i)
      const processMatch = trimmedLine.match(/^Process[:\s]+(.+)/i)
      const resultMatch = trimmedLine.match(/^Result[:\s]+(.+)/i)
      const tipMatch = trimmedLine.match(/^(?:Tip|Note|Hint)[:\s]+(.+)/i)

      if (answerMatch) {
        answer = cleanText(answerMatch[1].trim())
      } else if (stepMatch) {
        // Save previous step
        if (currentStepData && currentStepData.title) {
          parsedSteps.push({
            number: currentStepData.number || parsedSteps.length + 1,
            title: cleanText(currentStepData.title),
            goal: currentStepData.goal ? cleanText(currentStepData.goal) : undefined,
            process: currentStepData.process ? cleanText(currentStepData.process) : undefined,
            result: currentStepData.result ? cleanText(currentStepData.result) : undefined,
            explanation: cleanText(currentStepData.explanation || ''),
            tip: currentStepData.tip ? cleanText(currentStepData.tip) : undefined
          })
        }
        currentStepData = {
          number: parseInt(stepMatch[1]),
          title: stepMatch[2].trim(),
          explanation: ''
        }
        currentSection = ''
      } else if (currentStepData) {
        if (goalMatch) {
          currentStepData.goal = goalMatch[1].trim()
          currentSection = 'goal'
        } else if (processMatch) {
          currentStepData.process = processMatch[1].trim()
          currentSection = 'process'
        } else if (resultMatch) {
          currentStepData.result = resultMatch[1].trim()
          currentSection = 'result'
        } else if (tipMatch) {
          currentStepData.tip = tipMatch[1].trim()
          currentSection = 'tip'
        } else {
          // Append to current section or explanation
          if (currentSection === 'goal') {
            currentStepData.goal = (currentStepData.goal || '') + ' ' + trimmedLine
          } else if (currentSection === 'process') {
            currentStepData.process = (currentStepData.process || '') + ' ' + trimmedLine
          } else if (currentSection === 'result') {
            currentStepData.result = (currentStepData.result || '') + ' ' + trimmedLine
          } else if (currentSection === 'tip') {
            currentStepData.tip = (currentStepData.tip || '') + ' ' + trimmedLine
          } else {
            currentStepData.explanation = (currentStepData.explanation || '') + ' ' + trimmedLine
          }
        }
      }
    }

    // Push final step
    if (currentStepData && currentStepData.title) {
      parsedSteps.push({
        number: currentStepData.number || parsedSteps.length + 1,
        title: cleanText(currentStepData.title),
        goal: currentStepData.goal ? cleanText(currentStepData.goal) : undefined,
        process: currentStepData.process ? cleanText(currentStepData.process) : undefined,
        result: currentStepData.result ? cleanText(currentStepData.result) : undefined,
        explanation: cleanText((currentStepData.explanation || '').trim()),
        tip: currentStepData.tip ? cleanText(currentStepData.tip) : undefined
      })
    }

    // Fallback for unstructured responses
    if (parsedSteps.length === 0) {
      const chunks = response.split(/\n\n+/)
      chunks.forEach((chunk, i) => {
        if (chunk.trim() && !chunk.toLowerCase().includes('final answer')) {
          parsedSteps.push({
            number: i + 1,
            title: `Step ${i + 1}`,
            explanation: cleanText(chunk.trim())
          })
        }
      })
    }

    return { steps: parsedSteps, answer: answer || 'See final step for the answer.' }
  }

  const handleSolve = async () => {
    if (!problem.trim()) {
      setError('Please enter a problem to solve')
      return
    }

    setLoading(true)
    setError('')
    setSteps([])
    setCurrentStep(0)
    setFinalAnswer('')
    setSelectedHistoryId(null)

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'solver',
          input: problem,
          subject,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to solve problem')
      }

      const { steps: parsedSteps, answer } = parseSteps(data.response)
      setSteps(parsedSteps)
      setFinalAnswer(answer)
      setMode('solving')

      // Save to Supabase
      await saveProblem(problem, { steps: parsedSteps, finalAnswer: answer }, subject)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleNextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      setMode('complete')
    }
  }

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleReset = () => {
    setMode('input')
    setSteps([])
    setCurrentStep(0)
    setFinalAnswer('')
    setProblem('')
    setSelectedHistoryId(null)
  }

  return (
    <div className="relative">
      {/* History Toggle Button */}
      {history.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`fixed top-24 right-4 z-40 px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2 ${
            showHistory
              ? 'bg-accent-blue text-white'
              : 'bg-bg-card border border-border-default text-text-secondary hover:text-accent-blue hover:border-accent-blue/50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">History</span>
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
            showHistory ? 'bg-white/20 text-white' : 'bg-accent-blue text-white'
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
            <Card className="p-4 shadow-xl border-accent-blue/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-text-primary flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recent Problems
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
                          ? 'bg-accent-blue/20 border border-accent-blue/30'
                          : 'bg-bg-secondary hover:bg-bg-elevated border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${
                            selectedHistoryId === item.id ? 'text-accent-blue' : 'text-text-primary'
                          }`}>
                            {item.problem.substring(0, 50)}{item.problem.length > 50 ? '...' : ''}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatDate(item.created_at)}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted capitalize">
                              {item.subject}
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
          <h1 className="text-3xl font-bold text-text-primary">Problem Solver</h1>
          <p className="text-text-secondary mt-2">
            Learn step-by-step at your own pace. Make sure you understand each step before moving on.
          </p>
        </div>

        {mode === 'input' && (
          <Card className="overflow-hidden border-2 border-border-default hover:border-accent-blue/30 transition-colors duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-accent-blue/10 to-transparent px-6 py-4 border-b border-border-default">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-blue/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">What do you need help with?</h2>
                  <p className="text-sm text-text-muted">Enter your problem and we&apos;ll break it down step by step</p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="p-6 space-y-6">
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

              <Textarea
                label="Your Problem"
                placeholder="Type or paste your problem here...

Examples:
• Solve for x: 2x + 5 = 15
• Explain the causes of the American Revolution
• Calculate the area of a circle with radius 5"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                rows={6}
                hint="Be as specific as possible for the best step-by-step explanation"
                error={error}
              />

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Powered by AI</span>
                </div>
                <Button onClick={handleSolve} loading={loading} className="px-8">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Solving
                </Button>
              </div>
            </div>
          </Card>
        )}

        {mode === 'solving' && steps.length > 0 && (
          <div className="space-y-5">
            {/* Problem Card */}
            <Card className="bg-bg-secondary border-accent-green/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-text-muted text-xs font-medium uppercase tracking-wide">Problem</span>
                <Button variant="ghost" size="sm" onClick={handleReset}>New</Button>
              </div>
              <p className="text-text-primary font-medium">{problem}</p>
            </Card>

            {/* Progress Section */}
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="bg-bg-card rounded-xl p-4 border border-border-default">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-accent-green">{currentStep + 1}</span>
                    <span className="text-text-muted text-sm">of {steps.length} steps</span>
                  </div>
                  <span className="text-sm font-medium text-text-primary">
                    {Math.round(((currentStep + 1) / steps.length) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent-green to-accent-teal rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Step Indicators */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {steps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => index <= currentStep && setCurrentStep(index)}
                    className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                      index === currentStep
                        ? 'bg-gradient-to-br from-accent-green to-accent-teal text-white shadow-md'
                        : index < currentStep
                        ? 'bg-accent-green text-white'
                        : 'bg-bg-secondary text-text-muted border border-border-default'
                    } ${index <= currentStep ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed'}`}
                  >
                    {index < currentStep ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </button>
                ))}
                {/* Final checkmark */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                  currentStep === steps.length - 1
                    ? 'bg-bg-secondary border border-accent-green/50 text-accent-green'
                    : 'bg-bg-secondary border border-border-default text-text-muted'
                }`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Current Step Card */}
            <Card className="border border-accent-green/30 overflow-hidden">
              {/* Step Header */}
              <div className="bg-gradient-to-r from-accent-green/10 to-transparent p-5 border-b border-accent-green/20">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-green to-accent-teal flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">{steps[currentStep].number}</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-accent-green text-xs font-medium">Step {currentStep + 1} of {steps.length}</span>
                    <h3 className="text-lg font-semibold text-text-primary leading-snug mt-0.5">
                      {steps[currentStep].title}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Step Content */}
              <div className="p-5 space-y-4">
                {/* Structured sections */}
                <div className="space-y-3">
                  {/* Goal */}
                  {steps[currentStep].goal && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                      <p className="text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wide mb-1">Goal</p>
                      <p className="text-text-primary text-sm leading-relaxed">{steps[currentStep].goal}</p>
                    </div>
                  )}

                  {/* Process */}
                  {steps[currentStep].process && (
                    <div className="bg-bg-secondary/70 border border-border-default rounded-lg p-3">
                      <p className="text-accent-green text-xs font-semibold uppercase tracking-wide mb-1">How to do it</p>
                      <p className="text-text-primary text-sm leading-relaxed">{steps[currentStep].process}</p>
                    </div>
                  )}

                  {/* Result */}
                  {steps[currentStep].result && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                      <p className="text-purple-600 dark:text-purple-400 text-xs font-semibold uppercase tracking-wide mb-1">Result</p>
                      <p className="text-text-primary text-sm leading-relaxed font-medium">{steps[currentStep].result}</p>
                    </div>
                  )}

                  {/* Fallback explanation if no structured sections */}
                  {!steps[currentStep].goal && !steps[currentStep].process && !steps[currentStep].result && steps[currentStep].explanation && (
                    <div className="bg-bg-secondary/50 rounded-lg p-3">
                      <p className="text-text-primary text-sm leading-relaxed">{steps[currentStep].explanation}</p>
                    </div>
                  )}
                </div>

                {/* Tip */}
                {steps[currentStep].tip && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wide mb-1">Tip</p>
                    <p className="text-text-primary text-sm leading-relaxed">{steps[currentStep].tip}</p>
                  </div>
                )}

                {/* Progress dots */}
                <div className="flex items-center justify-center gap-1 py-1">
                  {steps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        index === currentStep
                          ? 'w-8 bg-gradient-to-r from-accent-green to-accent-teal'
                          : index < currentStep
                          ? 'w-4 bg-accent-green/50'
                          : 'w-4 bg-bg-secondary'
                      }`}
                    />
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4 border-t border-border-default">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePrevStep}
                    disabled={currentStep === 0}
                    className="gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleNextStep}
                    className="gap-1.5"
                  >
                    {currentStep === steps.length - 1 ? (
                      <>
                        See Answer
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </>
                    ) : (
                      <>
                        Next
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {mode === 'complete' && (
          <div className="space-y-4">
            {/* Success Header */}
            <Card className="border border-accent-green/30 bg-gradient-to-r from-accent-green/5 to-transparent">
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-accent-green/20 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-text-primary">Problem Solved</h2>
                <p className="text-text-muted text-sm mt-1">{steps.length} steps completed</p>
              </div>
            </Card>

            {/* Final Answer */}
            <Card className="border border-accent-green">
              <p className="text-xs font-medium text-accent-green uppercase tracking-wide mb-2">Answer</p>
              <p className="text-lg text-text-primary font-semibold">{finalAnswer}</p>
            </Card>

            {/* Original Problem */}
            <Card className="bg-bg-secondary/50">
              <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Problem</p>
              <p className="text-text-primary">{problem}</p>
            </Card>

            {/* Steps Summary */}
            <Card>
              <button
                onClick={() => setExpandedSteps(expandedSteps.length === steps.length ? [] : steps.map((_, i) => i))}
                className="w-full flex items-center justify-between text-left"
              >
                <span className="font-medium text-text-primary">Solution Steps</span>
                <span className="text-text-muted text-sm">
                  {expandedSteps.length === steps.length ? 'Collapse' : 'Expand'}
                </span>
              </button>

              <div className="mt-3 space-y-1">
                {steps.map((step, index) => (
                  <div key={index} className="border border-border-default rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedSteps(prev =>
                        prev.includes(index)
                          ? prev.filter(i => i !== index)
                          : [...prev, index]
                      )}
                      className="w-full flex items-center gap-2 p-3 text-left hover:bg-bg-secondary/50 transition-colors"
                    >
                      <span className="w-6 h-6 rounded-full bg-accent-green/20 flex items-center justify-center flex-shrink-0 text-accent-green text-xs font-medium">
                        {step.number}
                      </span>
                      <span className="flex-1 text-sm text-text-primary">{step.title}</span>
                      <svg
                        className={`w-4 h-4 text-text-muted transition-transform ${expandedSteps.includes(index) ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedSteps.includes(index) && (
                      <div className="px-3 pb-3 ml-8 space-y-2">
                        {step.goal && (
                          <div className="text-xs">
                            <span className="text-blue-500 font-medium">Goal: </span>
                            <span className="text-text-secondary">{step.goal}</span>
                          </div>
                        )}
                        {step.process && (
                          <div className="text-xs">
                            <span className="text-accent-green font-medium">How: </span>
                            <span className="text-text-secondary">{step.process}</span>
                          </div>
                        )}
                        {step.result && (
                          <div className="text-xs">
                            <span className="text-purple-500 font-medium">Result: </span>
                            <span className="text-text-primary font-medium">{step.result}</span>
                          </div>
                        )}
                        {!step.goal && !step.process && !step.result && step.explanation && (
                          <p className="text-text-secondary text-xs">{step.explanation}</p>
                        )}
                        {step.tip && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded p-2">
                            Tip: {step.tip}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCurrentStep(0)
                  setMode('solving')
                }}
                className="flex-1"
              >
                Review Steps
              </Button>
              <Button
                size="sm"
                onClick={handleReset}
                className="flex-1"
              >
                New Problem
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
