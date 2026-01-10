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

const questionTypes = [
  { value: '', label: 'Select question type...' },
  { value: 'multiple-choice', label: 'Multiple Choice' },
  { value: 'true-false', label: 'True or False' },
  { value: 'mixed', label: 'Mixed (Both Types)' },
]

const questionCounts = [
  { value: '', label: 'Select number...' },
  { value: '5', label: '5 Questions' },
  { value: '10', label: '10 Questions' },
  { value: '15', label: '15 Questions' },
  { value: '20', label: '20 Questions' },
]

const difficulties = [
  { value: '', label: 'Select difficulty...' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

interface Question {
  id: number
  question: string
  type: 'multiple-choice' | 'true-false' | 'short-answer'
  options?: string[]
  correctAnswer: string
  explanation: string
}

interface UserAnswer {
  questionId: number
  answer: string
}

interface QuizData {
  questions: Question[]
  material: string
}

interface SavedQuiz {
  id: string
  material_preview: string
  subject: string
  quiz_data: QuizData
  created_at: string
}

export default function QuestionsPage() {
  // Form state
  const [subject, setSubject] = useState('')
  const [questionType, setQuestionType] = useState('')
  const [questionCount, setQuestionCount] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [material, setMaterial] = useState('')

  // Quiz state
  const [questions, setQuestions] = useState<Question[]>([])
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'input' | 'quiz' | 'results'>('input')
  const [currentQuestion, setCurrentQuestion] = useState(0)

  // History state
  const [history, setHistory] = useState<SavedQuiz[]>([])
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
          .eq('feature_type', 'questions')
          .order('created_at', { ascending: false })
          .limit(20)

        if (!fetchError && data) {
          const parsed: SavedQuiz[] = data
            .map(item => {
              try {
                return {
                  id: item.id,
                  material_preview: item.input_text.substring(0, 100),
                  subject: item.subject || 'math',
                  quiz_data: JSON.parse(item.output_text),
                  created_at: item.created_at,
                }
              } catch {
                return null
              }
            })
            .filter((item): item is SavedQuiz => item !== null)
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
  const saveQuiz = async (materialText: string, quizQuestions: Question[], subj: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const quizData: QuizData = {
        questions: quizQuestions,
        material: materialText,
      }

      const { data: inserted, error: insertError } = await supabase
        .from('study_sessions')
        .insert({
          user_id: session.user.id,
          feature_type: 'questions',
          subject: subj,
          input_text: materialText,
          output_text: JSON.stringify(quizData),
        })
        .select()
        .single()

      if (!insertError && inserted) {
        const newItem: SavedQuiz = {
          id: inserted.id,
          material_preview: materialText.substring(0, 100),
          subject: subj,
          quiz_data: quizData,
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
  const loadFromHistory = (item: SavedQuiz) => {
    setMaterial(item.quiz_data.material)
    setSubject(item.subject)
    setQuestions(item.quiz_data.questions)
    setUserAnswers(item.quiz_data.questions.map(q => ({ questionId: q.id, answer: '' })))
    setCurrentQuestion(0)
    setSelectedHistoryId(item.id)
    setError('')
    setMode('quiz')
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

  const parseQuestions = (response: string): Question[] => {
    const cleanResponse = response
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .trim()

    const parsed: Question[] = []
    const questionBlocks = cleanResponse.split(/(?=(?:Question\s*\d+|\d+[.)]\s))/i).filter(b => b.trim())

    let id = 0
    for (const block of questionBlocks) {
      const lines = block.split('\n').filter(l => l.trim())
      if (lines.length === 0) continue

      const questionMatch = lines[0].match(/^(?:Question\s*)?(\d+)?[.):\s]*(.+)/i)
      if (!questionMatch) continue

      const questionText = questionMatch[2].trim()
      if (!questionText || questionText.length < 5) continue

      id++
      const question: Question = {
        id,
        question: questionText,
        type: 'short-answer',
        correctAnswer: '',
        explanation: ''
      }

      const options: string[] = []
      let foundAnswer = false

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()

        const optionMatch = line.match(/^([A-D])[.):\s]+(.+)/i)
        if (optionMatch) {
          options.push(optionMatch[2].trim())
          question.type = 'multiple-choice'
        }

        const tfMatch = line.match(/^(True|False)[:\s]*(.*)/i)
        if (tfMatch && !optionMatch) {
          question.type = 'true-false'
        }

        const answerMatch = line.match(/^(?:Answer|Correct(?:\s*Answer)?)[:\s]+(.+)/i)
        if (answerMatch) {
          question.correctAnswer = answerMatch[1].trim()
            .replace(/^[A-D][.):\s]*/i, '')
            .replace(/^(True|False)[:\s]*/i, '$1')
          foundAnswer = true
        }

        const explanationMatch = line.match(/^(?:Explanation|Why|Reason)[:\s]+(.+)/i)
        if (explanationMatch) {
          question.explanation = explanationMatch[1].trim()
        }
      }

      if (options.length > 0) {
        question.options = options
      }

      if (question.type === 'true-false' && !question.options) {
        question.options = ['True', 'False']
      }

      if (!foundAnswer && lines.length > 1) {
        for (let i = lines.length - 1; i >= 1; i--) {
          const line = lines[i].trim()
          if (line && !line.match(/^[A-D][.):\s]/i) && !line.match(/^(?:Explanation|Why)/i)) {
            question.correctAnswer = line.replace(/^[-•]\s*/, '')
            break
          }
        }
      }

      if (question.question && question.correctAnswer) {
        parsed.push(question)
      }
    }

    return parsed
  }

  const handleGenerate = async () => {
    if (!material.trim()) {
      setError('Please enter study material or a topic')
      return
    }

    setLoading(true)
    setError('')
    setQuestions([])
    setUserAnswers([])
    setCurrentQuestion(0)
    setSelectedHistoryId(null)

    const numQuestions = parseInt(questionCount)

    const questionTypePrompt = questionType === 'multiple-choice'
      ? 'multiple choice questions with 4 options (A, B, C, D)'
      : questionType === 'true-false'
      ? 'true/false questions'
      : 'a mix of multiple choice and true/false questions'

    const difficultyPrompt = difficulty === 'easy'
      ? 'Keep the questions simple and focused on basic recall and understanding.'
      : difficulty === 'hard'
      ? 'Make the questions challenging, requiring critical thinking and deeper analysis.'
      : 'Include a mix of straightforward and moderately challenging questions.'

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'questions',
          input: `Generate exactly ${numQuestions} ${questionTypePrompt} about this topic/material.
${difficultyPrompt}

Format each question EXACTLY like this:

Question 1: [Question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Answer: [Correct letter and answer]
Explanation: [Brief explanation why this is correct]

Topic/Material:
${material}`,
          subject,
          questionCount: numQuestions,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate questions')
      }

      const parsedQuestions = parseQuestions(data.response)
      if (parsedQuestions.length === 0) {
        throw new Error('Could not parse questions. Please try again.')
      }

      setQuestions(parsedQuestions)
      setUserAnswers(parsedQuestions.map(q => ({ questionId: q.id, answer: '' })))
      setMode('quiz')

      // Save to Supabase
      await saveQuiz(material, parsedQuestions, subject)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleAnswer = (answer: string) => {
    setUserAnswers(prev =>
      prev.map(ua =>
        ua.questionId === questions[currentQuestion].id
          ? { ...ua, answer }
          : ua
      )
    )
  }

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
    }
  }

  const handlePrev = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1)
    }
  }

  const handleSubmit = () => {
    setMode('results')
  }

  const handleRetry = () => {
    setUserAnswers(questions.map(q => ({ questionId: q.id, answer: '' })))
    setCurrentQuestion(0)
    setMode('quiz')
  }

  const handleNewQuiz = () => {
    setMode('input')
    setQuestions([])
    setUserAnswers([])
    setCurrentQuestion(0)
    setMaterial('')
    setSubject('')
    setQuestionType('')
    setQuestionCount('')
    setDifficulty('')
    setSelectedHistoryId(null)
  }

  const calculateScore = () => {
    let correct = 0
    for (const q of questions) {
      const userAnswer = userAnswers.find(ua => ua.questionId === q.id)?.answer || ''
      const normalizedUser = userAnswer.toLowerCase().trim()
      const normalizedCorrect = q.correctAnswer.toLowerCase().trim()

      if (normalizedUser === normalizedCorrect ||
          normalizedCorrect.includes(normalizedUser) ||
          normalizedUser.includes(normalizedCorrect.charAt(0))) {
        correct++
      }
    }
    return correct
  }

  const isAnswerCorrect = (question: Question): boolean => {
    const userAnswer = userAnswers.find(ua => ua.questionId === question.id)?.answer || ''
    const normalizedUser = userAnswer.toLowerCase().trim()
    const normalizedCorrect = question.correctAnswer.toLowerCase().trim()

    return normalizedUser === normalizedCorrect ||
           normalizedCorrect.includes(normalizedUser) ||
           (question.options !== undefined && normalizedUser === normalizedCorrect.charAt(0).toLowerCase())
  }

  const currentAnswer = userAnswers.find(ua => ua.questionId === questions[currentQuestion]?.id)?.answer || ''
  const answeredCount = userAnswers.filter(ua => ua.answer !== '').length

  return (
    <div className="relative">
      {/* History Toggle Button */}
      {history.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`fixed top-24 right-4 z-40 px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2 ${
            showHistory
              ? 'bg-amber-500 text-white'
              : 'bg-bg-card border border-border-default text-text-secondary hover:text-amber-500 hover:border-amber-500/50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">History</span>
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
            showHistory ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'
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
            <Card className="p-4 shadow-xl border-amber-500/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-text-primary flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recent Quizzes
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
                          ? 'bg-amber-500/20 border border-amber-500/30'
                          : 'bg-bg-secondary hover:bg-bg-elevated border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${
                            selectedHistoryId === item.id ? 'text-amber-500' : 'text-text-primary'
                          }`}>
                            {item.material_preview.substring(0, 50)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatDate(item.created_at)}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
                              {item.quiz_data.questions.length} Q
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
          <h1 className="text-3xl font-bold text-text-primary">Practice Quiz</h1>
          <p className="text-text-secondary mt-2">
            Generate custom quizzes to test your knowledge and track your progress.
          </p>
        </div>

        {/* Input Mode */}
        {mode === 'input' && (
          <Card className="overflow-hidden border-2 border-border-default hover:border-amber-500/30 transition-colors duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500/10 to-transparent px-6 py-4 border-b border-border-default">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Create Your Quiz</h2>
                  <p className="text-sm text-text-muted">Configure your quiz settings and enter a topic or study material</p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="p-6 space-y-6">
              {/* Row 1: Subject & Question Type */}
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
                  label="Question Type"
                  options={questionTypes}
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
              </div>

              {/* Row 2: Question Count & Difficulty */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Select
                  label="Number of Questions"
                  options={questionCounts}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                  }
                />
                <Select
                  label="Difficulty"
                  options={difficulties}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  }
                />
              </div>

              {/* Material Input */}
              <Textarea
                label="Topic or Study Material"
                placeholder="Enter what you want to be quizzed on...

Examples:
- The American Revolution and its causes
- Photosynthesis and cellular respiration
- Or paste your notes, textbook excerpt, or study guide here"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                rows={6}
                hint="The more detail you provide, the better your quiz questions will be"
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
                  disabled={!subject || !questionType || !questionCount || !difficulty || !material.trim()}
                  className="px-8"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Generate Quiz
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Quiz Mode */}
        {mode === 'quiz' && questions.length > 0 && (
          <div className="space-y-5">
            {/* Quiz Info Card */}
            <Card className="bg-bg-secondary border-amber-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-text-muted text-xs font-medium uppercase tracking-wide">Quiz Topic</span>
                <Button variant="ghost" size="sm" onClick={handleNewQuiz}>New Quiz</Button>
              </div>
              <p className="text-text-primary font-medium">{material.substring(0, 100)}{material.length > 100 ? '...' : ''}</p>
            </Card>

            {/* Progress Section */}
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="bg-bg-card rounded-xl p-4 border border-border-default">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-amber-500">{answeredCount}</span>
                    <span className="text-text-muted text-sm">of {questions.length} answered</span>
                  </div>
                  <span className="text-sm font-medium text-text-primary">
                    {Math.round((answeredCount / questions.length) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Question Indicators */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {questions.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentQuestion(index)}
                    className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                      index === currentQuestion
                        ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md'
                        : userAnswers[index]?.answer
                        ? 'bg-accent-green text-white'
                        : 'bg-bg-secondary text-text-muted border border-border-default hover:border-amber-500/50'
                    } cursor-pointer hover:scale-105`}
                  >
                    {userAnswers[index]?.answer && index !== currentQuestion ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Current Question Card */}
            <Card className="border border-amber-500/30 overflow-hidden">
              {/* Question Header */}
              <div className="bg-gradient-to-r from-amber-500/10 to-transparent p-5 border-b border-amber-500/20">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">{currentQuestion + 1}</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-amber-500 text-xs font-medium">Question {currentQuestion + 1} of {questions.length}</span>
                    <h3 className="text-lg font-semibold text-text-primary leading-snug mt-0.5">
                      {questions[currentQuestion].question}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Answer Options */}
              <div className="p-5 space-y-3">
                {questions[currentQuestion].options ? (
                  questions[currentQuestion].options.map((option, index) => {
                    const letter = String.fromCharCode(65 + index)
                    const isSelected = currentAnswer.toLowerCase() === letter.toLowerCase() ||
                                       currentAnswer.toLowerCase() === option.toLowerCase()
                    return (
                      <button
                        key={index}
                        onClick={() => handleAnswer(letter)}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500'
                            : 'bg-bg-secondary border-border-default hover:border-amber-500/50 hover:bg-bg-elevated'
                        }`}
                      >
                        <span className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold shrink-0 ${
                          isSelected ? 'bg-amber-500 text-white' : 'bg-bg-card text-text-muted'
                        }`}>
                          {letter}
                        </span>
                        <span className={isSelected ? 'text-text-primary' : 'text-text-secondary'}>
                          {option}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <Textarea
                    placeholder="Type your answer here..."
                    value={currentAnswer}
                    onChange={(e) => handleAnswer(e.target.value)}
                    rows={3}
                  />
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4 border-t border-border-default">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePrev}
                    disabled={currentQuestion === 0}
                    className="gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </Button>

                  <Button
                    size="sm"
                    onClick={currentQuestion === questions.length - 1 ? handleSubmit : handleNext}
                    disabled={currentQuestion === questions.length - 1 && answeredCount < questions.length}
                    className="gap-1.5"
                  >
                    {currentQuestion === questions.length - 1 ? (
                      <>
                        Submit Quiz
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

            {answeredCount < questions.length && (
              <p className="text-center text-text-muted text-sm">
                Answer all questions to submit your quiz
              </p>
            )}
          </div>
        )}

        {/* Results Mode */}
        {mode === 'results' && (
          <div className="space-y-4">
            {/* Success Header */}
            <Card className={`border overflow-hidden ${
              calculateScore() >= questions.length * 0.7
                ? 'border-accent-green/30 bg-gradient-to-r from-accent-green/5 to-transparent'
                : calculateScore() >= questions.length * 0.5
                ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-transparent'
                : 'border-error/30 bg-gradient-to-r from-error/5 to-transparent'
            }`}>
              <div className="text-center py-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  calculateScore() >= questions.length * 0.7 ? 'bg-accent-green/20' : calculateScore() >= questions.length * 0.5 ? 'bg-amber-500/20' : 'bg-error/20'
                }`}>
                  <span className={`text-3xl font-bold ${
                    calculateScore() >= questions.length * 0.7 ? 'text-accent-green' : calculateScore() >= questions.length * 0.5 ? 'text-amber-500' : 'text-error'
                  }`}>
                    {Math.round((calculateScore() / questions.length) * 100)}%
                  </span>
                </div>
                <h2 className="text-xl font-bold text-text-primary">
                  {calculateScore() >= questions.length * 0.7 ? 'Excellent Work!' : calculateScore() >= questions.length * 0.5 ? 'Good Effort!' : 'Keep Practicing!'}
                </h2>
                <p className="text-text-muted text-sm mt-1">
                  You got {calculateScore()} out of {questions.length} questions correct
                </p>
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRetry}
                className="flex-1"
              >
                Try Again
              </Button>
              <Button
                size="sm"
                onClick={handleNewQuiz}
                className="flex-1"
              >
                New Quiz
              </Button>
            </div>

            {/* Review Section */}
            <Card>
              <h3 className="font-medium text-text-primary mb-3">Review Answers</h3>
              <div className="space-y-2">
                {questions.map((question, index) => {
                  const userAnswer = userAnswers.find(ua => ua.questionId === question.id)?.answer || ''
                  const correct = isAnswerCorrect(question)

                  return (
                    <div key={question.id} className={`border rounded-lg overflow-hidden ${correct ? 'border-accent-green/30' : 'border-error/30'}`}>
                      <div className={`px-4 py-2 ${correct ? 'bg-accent-green/10' : 'bg-error/10'} flex items-center gap-3`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          correct ? 'bg-accent-green/20' : 'bg-error/20'
                        }`}>
                          {correct ? (
                            <svg className="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm font-medium ${correct ? 'text-accent-green' : 'text-error'}`}>
                          Question {index + 1}
                        </span>
                      </div>

                      <div className="p-4 space-y-3">
                        <p className="text-text-primary text-sm">{question.question}</p>

                        <div className="grid sm:grid-cols-2 gap-2">
                          <div className={`p-2 rounded-lg text-sm ${correct ? 'bg-accent-green/10 border border-accent-green/20' : 'bg-error/10 border border-error/20'}`}>
                            <p className="text-xs text-text-muted mb-0.5">Your Answer</p>
                            <p className={`font-medium ${correct ? 'text-accent-green' : 'text-error'}`}>
                              {userAnswer || 'No answer'}
                            </p>
                          </div>
                          {!correct && (
                            <div className="p-2 rounded-lg bg-accent-green/10 border border-accent-green/20 text-sm">
                              <p className="text-xs text-text-muted mb-0.5">Correct Answer</p>
                              <p className="text-accent-green font-medium">{question.correctAnswer}</p>
                            </div>
                          )}
                        </div>

                        {question.explanation && (
                          <div className="p-2 rounded-lg bg-accent-blue/10 border border-accent-blue/20">
                            <p className="text-xs text-accent-blue mb-0.5 font-medium">Explanation</p>
                            <p className="text-text-secondary text-sm">{question.explanation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
