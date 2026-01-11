'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Card, Select, Textarea } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { generateAIResponse } from '@/lib/ai-client'

type ToolType = 'solver' | 'explainer' | 'summarizer'

const tools = [
  { id: 'solver' as ToolType, name: 'Problem Solver', icon: '🧮', description: 'Step-by-step solutions' },
  { id: 'explainer' as ToolType, name: 'Concept Explainer', icon: '💡', description: 'Understand any topic' },
  { id: 'summarizer' as ToolType, name: 'Summarizer', icon: '📝', description: 'Condense long texts' },
]

const subjects = [
  { value: 'math', label: 'Math' },
  { value: 'science', label: 'Science' },
  { value: 'ela', label: 'English Language Arts' },
  { value: 'social-studies', label: 'Social Studies' },
]

const gradeLevels = [
  { value: 'elementary', label: 'Elementary (Grades 3-5)' },
  { value: 'middle', label: 'Middle School (Grades 6-8)' },
  { value: 'high', label: 'High School (Grades 9-12)' },
]

const summaryLengths = [
  { value: 'brief', label: 'Brief (2-3 sentences)' },
  { value: 'detailed', label: 'Detailed (full summary)' },
  { value: 'key-points', label: 'Key Points Only' },
]

// Interfaces
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

interface SummaryData {
  mainIdea: string
  keyTerms: { term: string; definition: string }[]
  points: string[]
  connections: string[]
}

function ToolsContent() {
  const searchParams = useSearchParams()
  const [activeTool, setActiveTool] = useState<ToolType>('solver')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  // Handle tab query parameter from redirects
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['solver', 'explainer', 'summarizer'].includes(tab)) {
      setActiveTool(tab as ToolType)
    }
  }, [searchParams])

  // Solver state
  const [solverSubject, setSolverSubject] = useState('math')
  const [problem, setProblem] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [finalAnswer, setFinalAnswer] = useState('')
  const [solverMode, setSolverMode] = useState<'input' | 'solving' | 'complete'>('input')

  // Explainer state
  const [gradeLevel, setGradeLevel] = useState('high')
  const [topic, setTopic] = useState('')
  const [explanationData, setExplanationData] = useState<ExplanationData | null>(null)

  // Summarizer state
  const [summaryLength, setSummaryLength] = useState('detailed')
  const [text, setText] = useState('')
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)

  // Clean text helper
  const cleanText = (text: string): string => {
    return text
      .replace(/\\\[[\s\S]*?\\\]/g, '')
      .replace(/\\\([\s\S]*?\\\)/g, '')
      .replace(/\\boxed\{([^}]*)\}/g, '$1')
      .replace(/\$([^$]+)\$/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .trim()
  }

  // Parse solver response
  const parseSteps = (response: string): { steps: Step[]; finalAnswer: string } => {
    const cleanResponse = cleanText(response)
    const lines = cleanResponse.split('\n')
    const parsedSteps: Step[] = []
    let currentStepData: Partial<Step> | null = null
    let finalAns = ''

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      const stepMatch = trimmedLine.match(/^(?:Step\s*)?(\d+)[.:]\s*(.+)?/i)
      if (stepMatch) {
        if (currentStepData && currentStepData.number) {
          parsedSteps.push({
            number: currentStepData.number,
            title: currentStepData.title || `Step ${currentStepData.number}`,
            goal: currentStepData.goal,
            process: currentStepData.process,
            result: currentStepData.result,
            explanation: currentStepData.explanation || '',
            tip: currentStepData.tip,
          })
        }
        currentStepData = {
          number: parseInt(stepMatch[1]),
          title: stepMatch[2] || `Step ${stepMatch[1]}`,
          explanation: '',
        }
        continue
      }

      const goalMatch = trimmedLine.match(/^Goal:\s*(.+)/i)
      const processMatch = trimmedLine.match(/^Process:\s*(.+)/i)
      const resultMatch = trimmedLine.match(/^Result:\s*(.+)/i)
      const tipMatch = trimmedLine.match(/^Tip:\s*(.+)/i)
      const finalMatch = trimmedLine.match(/^Final\s*Answer:\s*(.+)/i)

      if (currentStepData) {
        if (goalMatch) currentStepData.goal = goalMatch[1]
        else if (processMatch) currentStepData.process = processMatch[1]
        else if (resultMatch) currentStepData.result = resultMatch[1]
        else if (tipMatch) currentStepData.tip = tipMatch[1]
        else if (!goalMatch && !processMatch && !resultMatch && !tipMatch && !finalMatch) {
          currentStepData.explanation = (currentStepData.explanation || '') + ' ' + trimmedLine
        }
      }

      if (finalMatch) finalAns = finalMatch[1]
    }

    if (currentStepData && currentStepData.number) {
      parsedSteps.push({
        number: currentStepData.number,
        title: currentStepData.title || `Step ${currentStepData.number}`,
        goal: currentStepData.goal,
        process: currentStepData.process,
        result: currentStepData.result,
        explanation: currentStepData.explanation || '',
        tip: currentStepData.tip,
      })
    }

    return { steps: parsedSteps, finalAnswer: finalAns }
  }

  // Parse explainer response
  const parseExplanation = (response: string): ExplanationData => {
    const cleanResponse = cleanText(response)
    const sections = cleanResponse.split(/\n(?=[A-Z])/g)
    const data: ExplanationData = {
      mainPoints: [],
      detailedPoints: [],
      realWorldExamples: [],
      analogy: '',
      keyTerms: [],
      studyTips: [],
      commonTricks: [],
      quickReview: [],
    }

    let currentSection = ''
    for (const section of sections) {
      const lines = section.split('\n').filter(l => l.trim())
      if (lines.length === 0) continue

      const header = lines[0].toLowerCase()
      if (header.includes('main') || header.includes('key point')) {
        currentSection = 'main'
      } else if (header.includes('detail') || header.includes('explanation')) {
        currentSection = 'detail'
      } else if (header.includes('example') || header.includes('real')) {
        currentSection = 'example'
      } else if (header.includes('analogy')) {
        currentSection = 'analogy'
      } else if (header.includes('term') || header.includes('vocabulary')) {
        currentSection = 'terms'
      } else if (header.includes('tip') || header.includes('study')) {
        currentSection = 'tips'
      } else if (header.includes('trick') || header.includes('common')) {
        currentSection = 'tricks'
      } else if (header.includes('review') || header.includes('summary')) {
        currentSection = 'review'
      }

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].replace(/^[-•*]\s*/, '').trim()
        if (!line) continue

        switch (currentSection) {
          case 'main':
            data.mainPoints.push(line)
            break
          case 'detail':
            data.detailedPoints.push(line)
            break
          case 'example':
            data.realWorldExamples.push(line)
            break
          case 'analogy':
            data.analogy = line
            break
          case 'terms':
            const termMatch = line.match(/^([^:]+):\s*(.+)/)
            if (termMatch) {
              data.keyTerms.push({ term: termMatch[1].trim(), meaning: termMatch[2].trim() })
            }
            break
          case 'tips':
            data.studyTips.push(line)
            break
          case 'tricks':
            data.commonTricks.push(line)
            break
          case 'review':
            data.quickReview.push(line)
            break
        }
      }
    }

    // Fallback: if no structured data, use lines as main points
    if (data.mainPoints.length === 0 && data.detailedPoints.length === 0) {
      const lines = cleanResponse.split('\n').filter(l => l.trim())
      data.mainPoints = lines.slice(0, Math.min(5, lines.length))
    }

    return data
  }

  // Parse summarizer response
  const parseSummary = (response: string): SummaryData => {
    const cleanResponse = cleanText(response)
    const data: SummaryData = {
      mainIdea: '',
      keyTerms: [],
      points: [],
      connections: [],
    }

    const lines = cleanResponse.split('\n').filter(l => l.trim())
    let currentSection = 'main'

    for (const line of lines) {
      const trimmed = line.trim()
      const lower = trimmed.toLowerCase()

      if (lower.includes('main idea') || lower.includes('summary:')) {
        currentSection = 'main'
        const content = trimmed.replace(/^(main idea|summary)[:\s]*/i, '').trim()
        if (content) data.mainIdea = content
        continue
      } else if (lower.includes('key term') || lower.includes('vocabulary')) {
        currentSection = 'terms'
        continue
      } else if (lower.includes('key point') || lower.includes('important')) {
        currentSection = 'points'
        continue
      } else if (lower.includes('connection') || lower.includes('relate')) {
        currentSection = 'connections'
        continue
      }

      const content = trimmed.replace(/^[-•*]\s*/, '').trim()
      if (!content) continue

      switch (currentSection) {
        case 'main':
          if (!data.mainIdea) data.mainIdea = content
          else data.points.push(content)
          break
        case 'terms':
          const termMatch = content.match(/^([^:]+):\s*(.+)/)
          if (termMatch) {
            data.keyTerms.push({ term: termMatch[1].trim(), definition: termMatch[2].trim() })
          }
          break
        case 'points':
          data.points.push(content)
          break
        case 'connections':
          data.connections.push(content)
          break
      }
    }

    return data
  }

  // Handle solver submit
  const handleSolverSubmit = async () => {
    if (!problem.trim()) {
      setError('Please enter a problem to solve')
      return
    }

    setLoading(true)
    setError('')
    setSteps([])
    setFinalAnswer('')
    setCurrentStep(0)

    try {
      const response = await generateAIResponse({
        feature: 'solver',
        input: problem,
        subject: solverSubject as 'math' | 'science' | 'ela' | 'social-studies',
      })

      const parsed = parseSteps(response)
      if (parsed.steps.length === 0) {
        throw new Error('Could not parse the solution. Please try again.')
      }

      setSteps(parsed.steps)
      setFinalAnswer(parsed.finalAnswer)
      setSolverMode('solving')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to solve problem')
    } finally {
      setLoading(false)
    }
  }

  // Handle explainer submit
  const handleExplainerSubmit = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic to explain')
      return
    }

    setLoading(true)
    setError('')
    setExplanationData(null)

    try {
      const response = await generateAIResponse({
        feature: 'explainer',
        input: topic,
        gradeLevel: gradeLevel as 'elementary' | 'middle' | 'high',
      })

      const parsed = parseExplanation(response)
      setExplanationData(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to explain topic')
    } finally {
      setLoading(false)
    }
  }

  // Handle summarizer submit
  const handleSummarizerSubmit = async () => {
    if (!text.trim()) {
      setError('Please enter text to summarize')
      return
    }

    setLoading(true)
    setError('')
    setSummaryData(null)

    try {
      const response = await generateAIResponse({
        feature: 'summarizer',
        input: text,
        summaryLength: summaryLength as 'brief' | 'detailed' | 'key-points',
      })

      const parsed = parseSummary(response)
      setSummaryData(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to summarize text')
    } finally {
      setLoading(false)
    }
  }

  // Reset current tool
  const resetTool = () => {
    setError('')
    if (activeTool === 'solver') {
      setProblem('')
      setSteps([])
      setFinalAnswer('')
      setCurrentStep(0)
      setSolverMode('input')
    } else if (activeTool === 'explainer') {
      setTopic('')
      setExplanationData(null)
    } else if (activeTool === 'summarizer') {
      setText('')
      setSummaryData(null)
    }
  }

  // Get progress for solver
  const solverProgress = steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Study Tools</h1>
        <p className="text-text-secondary mt-1">
          AI-powered tools to help you learn and understand
        </p>
      </div>

      {/* Tool Tabs */}
      <div className="flex gap-2 p-1.5 bg-bg-card rounded-2xl border border-border-default overflow-x-auto">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => {
              setActiveTool(tool.id)
              setError('')
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
              activeTool === tool.id
                ? 'bg-accent-green text-white shadow-md'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
            }`}
          >
            <span className="text-lg">{tool.icon}</span>
            <span>{tool.name}</span>
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-error/10 border border-error/30 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-error flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-error text-sm">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-error hover:text-error/80">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Problem Solver */}
      {activeTool === 'solver' && (
        <>
          {solverMode === 'input' && (
            <Card className="overflow-hidden border-2 border-border-default hover:border-accent-green/30 transition-colors">
              <div className="bg-gradient-to-r from-accent-green/10 to-transparent px-6 py-4 border-b border-border-default">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center text-xl">
                    🧮
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Problem Solver</h2>
                    <p className="text-sm text-text-muted">Enter a problem and get step-by-step solutions</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <Select
                  label="Subject"
                  options={[{ value: '', label: 'Select subject...' }, ...subjects]}
                  value={solverSubject}
                  onChange={(e) => setSolverSubject(e.target.value)}
                />

                <Textarea
                  label="Problem"
                  placeholder="Enter your problem here...

Example: Solve for x: 2x + 5 = 15"
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  rows={4}
                />

                <Button onClick={handleSolverSubmit} loading={loading} disabled={!problem.trim()} className="w-full">
                  Solve Step-by-Step
                </Button>
              </div>
            </Card>
          )}

          {solverMode === 'solving' && steps.length > 0 && (
            <div className="space-y-4">
              {/* Progress */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-primary">
                    Step {currentStep + 1} of {steps.length}
                  </span>
                  <Button variant="ghost" size="sm" onClick={resetTool}>
                    New Problem
                  </Button>
                </div>
                <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-green rounded-full transition-all duration-500"
                    style={{ width: `${solverProgress}%` }}
                  />
                </div>
              </Card>

              {/* Current Step */}
              <Card className="border-2 border-accent-green/30">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-accent-green text-white flex items-center justify-center font-bold">
                      {steps[currentStep].number}
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary">{steps[currentStep].title}</h3>
                  </div>

                  {steps[currentStep].goal && (
                    <div className="mb-3 p-3 bg-accent-blue/10 border border-accent-blue/20 rounded-lg">
                      <p className="text-xs text-accent-blue font-medium mb-1">Goal</p>
                      <p className="text-sm text-text-primary">{steps[currentStep].goal}</p>
                    </div>
                  )}

                  {steps[currentStep].process && (
                    <div className="mb-3 p-3 bg-accent-green/10 border border-accent-green/20 rounded-lg">
                      <p className="text-xs text-accent-green font-medium mb-1">Process</p>
                      <p className="text-sm text-text-primary">{steps[currentStep].process}</p>
                    </div>
                  )}

                  {steps[currentStep].result && (
                    <div className="mb-3 p-3 bg-accent-purple/10 border border-accent-purple/20 rounded-lg">
                      <p className="text-xs text-accent-purple font-medium mb-1">Result</p>
                      <p className="text-sm text-text-primary">{steps[currentStep].result}</p>
                    </div>
                  )}

                  {steps[currentStep].explanation && (
                    <p className="text-text-secondary text-sm leading-relaxed mb-3">{steps[currentStep].explanation}</p>
                  )}

                  {steps[currentStep].tip && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-xs text-amber-500 font-medium mb-1">Tip</p>
                      <p className="text-sm text-text-primary">{steps[currentStep].tip}</p>
                    </div>
                  )}
                </div>

                {/* Navigation */}
                <div className="px-6 pb-6 flex items-center justify-between gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                    disabled={currentStep === 0}
                  >
                    Previous
                  </Button>
                  {currentStep < steps.length - 1 ? (
                    <Button onClick={() => setCurrentStep(currentStep + 1)}>
                      Next Step
                    </Button>
                  ) : (
                    <Button onClick={() => setSolverMode('complete')}>
                      See Answer
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          )}

          {solverMode === 'complete' && (
            <Card className="border-2 border-accent-green/30 bg-gradient-to-r from-accent-green/5 to-transparent">
              <div className="p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-accent-green/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">Problem Solved!</h3>
                {finalAnswer && (
                  <div className="mt-4 p-4 bg-accent-green/20 rounded-xl inline-block">
                    <p className="text-lg font-bold text-accent-green">{finalAnswer}</p>
                  </div>
                )}
                <div className="mt-6">
                  <Button onClick={resetTool}>Solve Another Problem</Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Concept Explainer */}
      {activeTool === 'explainer' && (
        <>
          {!explanationData ? (
            <Card className="overflow-hidden border-2 border-border-default hover:border-accent-blue/30 transition-colors">
              <div className="bg-gradient-to-r from-accent-blue/10 to-transparent px-6 py-4 border-b border-border-default">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-blue/20 flex items-center justify-center text-xl">
                    💡
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Concept Explainer</h2>
                    <p className="text-sm text-text-muted">Get clear explanations of any topic</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <Select
                  label="Grade Level"
                  options={[{ value: '', label: 'Select level...' }, ...gradeLevels]}
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                />

                <Textarea
                  label="Topic or Concept"
                  placeholder="Enter a topic to explain...

Example: How does photosynthesis work?"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={4}
                />

                <Button onClick={handleExplainerSubmit} loading={loading} disabled={!topic.trim()} className="w-full">
                  Explain This
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-text-primary">Explanation: {topic}</h2>
                <Button variant="secondary" size="sm" onClick={resetTool}>
                  New Topic
                </Button>
              </div>

              {explanationData.mainPoints.length > 0 && (
                <Card>
                  <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-accent-blue/20 flex items-center justify-center text-accent-blue text-sm">1</span>
                    Key Points
                  </h3>
                  <ul className="space-y-2">
                    {explanationData.mainPoints.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-text-secondary text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-2 flex-shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {explanationData.realWorldExamples.length > 0 && (
                <Card>
                  <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-accent-green/20 flex items-center justify-center text-accent-green text-sm">2</span>
                    Real-World Examples
                  </h3>
                  <ul className="space-y-2">
                    {explanationData.realWorldExamples.map((example, i) => (
                      <li key={i} className="flex items-start gap-2 text-text-secondary text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-green mt-2 flex-shrink-0" />
                        {example}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {explanationData.keyTerms.length > 0 && (
                <Card>
                  <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-accent-purple/20 flex items-center justify-center text-accent-purple text-sm">3</span>
                    Key Terms
                  </h3>
                  <div className="space-y-2">
                    {explanationData.keyTerms.map((item, i) => (
                      <div key={i} className="p-2 bg-bg-secondary rounded-lg">
                        <span className="font-medium text-accent-purple">{item.term}</span>
                        <span className="text-text-muted mx-2">-</span>
                        <span className="text-text-secondary text-sm">{item.meaning}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* Summarizer */}
      {activeTool === 'summarizer' && (
        <>
          {!summaryData ? (
            <Card className="overflow-hidden border-2 border-border-default hover:border-accent-purple/30 transition-colors">
              <div className="bg-gradient-to-r from-accent-purple/10 to-transparent px-6 py-4 border-b border-border-default">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-purple/20 flex items-center justify-center text-xl">
                    📝
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Summarizer</h2>
                    <p className="text-sm text-text-muted">Condense long texts into key points</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <Select
                  label="Summary Length"
                  options={[{ value: '', label: 'Select length...' }, ...summaryLengths]}
                  value={summaryLength}
                  onChange={(e) => setSummaryLength(e.target.value)}
                />

                <Textarea
                  label="Text to Summarize"
                  placeholder="Paste the text you want to summarize..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                />

                <Button onClick={handleSummarizerSubmit} loading={loading} disabled={!text.trim()} className="w-full">
                  Summarize
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-text-primary">Summary</h2>
                <Button variant="secondary" size="sm" onClick={resetTool}>
                  New Summary
                </Button>
              </div>

              {summaryData.mainIdea && (
                <Card className="border-accent-purple/30 bg-gradient-to-r from-accent-purple/5 to-transparent">
                  <h3 className="font-semibold text-accent-purple mb-2">Main Idea</h3>
                  <p className="text-text-primary">{summaryData.mainIdea}</p>
                </Card>
              )}

              {summaryData.points.length > 0 && (
                <Card>
                  <h3 className="font-semibold text-text-primary mb-3">Key Points</h3>
                  <ul className="space-y-2">
                    {summaryData.points.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-text-secondary text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-purple mt-2 flex-shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {summaryData.keyTerms.length > 0 && (
                <Card>
                  <h3 className="font-semibold text-text-primary mb-3">Key Terms</h3>
                  <div className="space-y-2">
                    {summaryData.keyTerms.map((item, i) => (
                      <div key={i} className="p-2 bg-bg-secondary rounded-lg">
                        <span className="font-medium text-accent-purple">{item.term}</span>
                        <span className="text-text-muted mx-2">-</span>
                        <span className="text-text-secondary text-sm">{item.definition}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {summaryData.connections.length > 0 && (
                <Card>
                  <h3 className="font-semibold text-text-primary mb-3">Connections</h3>
                  <ul className="space-y-2">
                    {summaryData.connections.map((conn, i) => (
                      <li key={i} className="flex items-start gap-2 text-text-secondary text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                        {conn}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ToolsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-text-secondary">Loading tools...</div>
      </div>
    }>
      <ToolsContent />
    </Suspense>
  )
}
