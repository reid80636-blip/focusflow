'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Select, Textarea } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { generateAIResponse } from '@/lib/ai-client'

// ============ SHARED OPTIONS ============
const subjects = [
  { value: '', label: 'Select a subject...' },
  { value: 'math', label: 'Math' },
  { value: 'science', label: 'Science' },
  { value: 'ela', label: 'English Language Arts' },
  { value: 'social-studies', label: 'Social Studies' },
]

// ============ QUIZ OPTIONS ============
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

// ============ FLASHCARD OPTIONS ============
const cardCounts = [
  { value: '', label: 'Select number...' },
  { value: '5', label: '5 Flashcards' },
  { value: '10', label: '10 Flashcards' },
  { value: '15', label: '15 Flashcards' },
  { value: '20', label: '20 Flashcards' },
]

// ============ NOTES OPTIONS ============
const noteStyles = [
  { value: '', label: 'Select style...' },
  { value: 'outline', label: 'Outline Format' },
  { value: 'cornell', label: 'Cornell Notes' },
  { value: 'bullet', label: 'Bullet Points' },
  { value: 'summary', label: 'Summary with Key Points' },
]

// ============ INTERFACES ============
type StudyTool = 'quiz' | 'flashcards' | 'notes'

// Quiz interfaces
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
  answerText: string
}

interface SavedQuiz {
  id: string
  material_preview: string
  subject: string
  quiz_data: { questions: Question[]; material: string }
  created_at: string
}

// Flashcard interfaces
interface Flashcard {
  id: number
  front: string
  back: string
}

interface SavedFlashcardSet {
  id: string
  material_preview: string
  subject: string
  flashcard_data: { cards: Flashcard[]; material: string }
  created_at: string
}

// Notes interfaces
interface NotesSection {
  title: string
  content: string[]
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
  notes_data: { notes: GeneratedNotes; material: string; style: string }
  created_at: string
}

export default function StudyPage() {
  // ============ SHARED STATE ============
  const [activeTool, setActiveTool] = useState<StudyTool>('quiz')
  const [subject, setSubject] = useState('')
  const [material, setMaterial] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ============ QUIZ STATE ============
  const [questionType, setQuestionType] = useState('')
  const [questionCount, setQuestionCount] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([])
  const [quizMode, setQuizMode] = useState<'input' | 'quiz' | 'results'>('input')
  const [currentQuestion, setCurrentQuestion] = useState(0)

  // ============ FLASHCARD STATE ============
  const [cardCount, setCardCount] = useState('')
  const [cards, setCards] = useState<Flashcard[]>([])
  const [currentCard, setCurrentCard] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [flashcardMode, setFlashcardMode] = useState<'input' | 'study'>('input')
  const [knownCards, setKnownCards] = useState<Set<number>>(new Set())

  // ============ NOTES STATE ============
  const [noteStyle, setNoteStyle] = useState('')
  const [notes, setNotes] = useState<GeneratedNotes | null>(null)
  const [notesMode, setNotesMode] = useState<'input' | 'view'>('input')

  // ============ HISTORY STATE ============
  const [quizHistory, setQuizHistory] = useState<SavedQuiz[]>([])
  const [flashcardHistory, setFlashcardHistory] = useState<SavedFlashcardSet[]>([])
  const [notesHistory, setNotesHistory] = useState<SavedNotes[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const supabase = createClient()

  // ============ FETCH HISTORY ============
  useEffect(() => {
    const fetchAllHistory = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setHistoryLoading(false)
          return
        }

        // Fetch all history types in parallel
        const [quizData, flashcardData, notesData] = await Promise.all([
          supabase.from('study_sessions').select('*').eq('feature_type', 'questions').order('created_at', { ascending: false }).limit(50),
          supabase.from('study_sessions').select('*').eq('feature_type', 'flashcards').order('created_at', { ascending: false }).limit(50),
          supabase.from('study_sessions').select('*').eq('feature_type', 'notes').order('created_at', { ascending: false }).limit(50),
        ])

        if (quizData.data) {
          setQuizHistory(quizData.data.map(item => {
            try {
              return {
                id: item.id,
                material_preview: item.input_text?.substring(0, 100) || '',
                subject: item.subject || 'general',
                quiz_data: JSON.parse(item.output_text),
                created_at: item.created_at,
              }
            } catch { return null }
          }).filter((item): item is SavedQuiz => item !== null))
        }

        if (flashcardData.data) {
          setFlashcardHistory(flashcardData.data.map(item => {
            try {
              return {
                id: item.id,
                material_preview: item.input_text?.substring(0, 100) || '',
                subject: item.subject || 'general',
                flashcard_data: JSON.parse(item.output_text),
                created_at: item.created_at,
              }
            } catch { return null }
          }).filter((item): item is SavedFlashcardSet => item !== null))
        }

        if (notesData.data) {
          setNotesHistory(notesData.data.map(item => {
            try {
              return {
                id: item.id,
                material_preview: item.input_text?.substring(0, 100) || '',
                subject: item.subject || 'general',
                notes_data: JSON.parse(item.output_text),
                created_at: item.created_at,
              }
            } catch { return null }
          }).filter((item): item is SavedNotes => item !== null))
        }
      } catch {
        // Silently fail
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchAllHistory()
  }, [supabase])

  // ============ UTILITY FUNCTIONS ============
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

  // ============ SAVE FUNCTIONS ============
  const saveQuizToHistory = async (materialText: string, quizQuestions: Question[], subj: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const quizData = { questions: quizQuestions, material: materialText }
      const { data: inserted, error } = await supabase
        .from('study_sessions')
        .insert({ user_id: session.user.id, feature_type: 'questions', subject: subj, input_text: materialText, output_text: JSON.stringify(quizData) })
        .select().single()

      if (!error && inserted) {
        setQuizHistory(prev => [{ id: inserted.id, material_preview: materialText.substring(0, 100), subject: subj, quiz_data: quizData, created_at: inserted.created_at }, ...prev])
      }
    } catch { /* Silently fail */ }
  }

  const saveFlashcardsToHistory = async (materialText: string, flashcards: Flashcard[], subj: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const flashcardData = { cards: flashcards, material: materialText }
      const { data: inserted, error } = await supabase
        .from('study_sessions')
        .insert({ user_id: session.user.id, feature_type: 'flashcards', subject: subj, input_text: materialText, output_text: JSON.stringify(flashcardData) })
        .select().single()

      if (!error && inserted) {
        setFlashcardHistory(prev => [{ id: inserted.id, material_preview: materialText.substring(0, 100), subject: subj, flashcard_data: flashcardData, created_at: inserted.created_at }, ...prev])
      }
    } catch { /* Silently fail */ }
  }

  const saveNotesToHistory = async (materialText: string, generatedNotes: GeneratedNotes, subj: string, style: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const notesData = { notes: generatedNotes, material: materialText, style }
      const { data: inserted, error } = await supabase
        .from('study_sessions')
        .insert({ user_id: session.user.id, feature_type: 'notes', subject: subj, input_text: materialText, output_text: JSON.stringify(notesData) })
        .select().single()

      if (!error && inserted) {
        setNotesHistory(prev => [{ id: inserted.id, material_preview: materialText.substring(0, 100), subject: subj, notes_data: notesData, created_at: inserted.created_at }, ...prev])
      }
    } catch { /* Silently fail */ }
  }

  // ============ LOAD FROM HISTORY ============
  const loadQuizFromHistory = (item: SavedQuiz) => {
    setMaterial(item.quiz_data.material)
    setSubject(item.subject)
    setQuestions(item.quiz_data.questions)
    setUserAnswers(item.quiz_data.questions.map(q => ({ questionId: q.id, answer: '', answerText: '' })))
    setCurrentQuestion(0)
    setQuizMode('quiz')
  }

  const loadFlashcardsFromHistory = (item: SavedFlashcardSet) => {
    setMaterial(item.flashcard_data.material)
    setSubject(item.subject)
    setCards(item.flashcard_data.cards)
    setCurrentCard(0)
    setIsFlipped(false)
    setKnownCards(new Set())
    setFlashcardMode('study')
  }

  const loadNotesFromHistory = (item: SavedNotes) => {
    setMaterial(item.notes_data.material)
    setSubject(item.subject)
    setNoteStyle(item.notes_data.style)
    setNotes(item.notes_data.notes)
    setNotesMode('view')
  }

  // ============ DELETE FROM HISTORY ============
  const deleteFromHistory = async (id: string, type: StudyTool) => {
    try {
      await supabase.from('study_sessions').delete().eq('id', id)
      if (type === 'quiz') setQuizHistory(prev => prev.filter(item => item.id !== id))
      else if (type === 'flashcards') setFlashcardHistory(prev => prev.filter(item => item.id !== id))
      else setNotesHistory(prev => prev.filter(item => item.id !== id))
    } catch { /* Silently fail */ }
  }

  // ============ COMBINED HISTORY ============
  type HistoryItem =
    | { type: 'quiz'; data: SavedQuiz }
    | { type: 'flashcards'; data: SavedFlashcardSet }
    | { type: 'notes'; data: SavedNotes }

  const combinedHistory: HistoryItem[] = [
    ...quizHistory.map(item => ({ type: 'quiz' as const, data: item })),
    ...flashcardHistory.map(item => ({ type: 'flashcards' as const, data: item })),
    ...notesHistory.map(item => ({ type: 'notes' as const, data: item })),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime())

  const filteredHistory = combinedHistory.filter(item => {
    const query = searchQuery.toLowerCase()
    if (!query) return true

    const matchesMaterial = item.data.material_preview.toLowerCase().includes(query)
    const matchesSubject = item.data.subject.toLowerCase().includes(query)
    const matchesType = item.type.toLowerCase().includes(query)

    if (item.type === 'notes') {
      const notesData = item.data as SavedNotes
      const matchesTitle = notesData.notes_data.notes.title.toLowerCase().includes(query)
      return matchesMaterial || matchesSubject || matchesType || matchesTitle
    }

    return matchesMaterial || matchesSubject || matchesType
  })

  // ============ QUIZ FUNCTIONS ============
  const parseQuestions = (response: string): Question[] => {
    const cleanResponse = response.replace(/\*\*/g, '').replace(/\*/g, '').trim()
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
        }

        const explanationMatch = line.match(/^(?:Explanation|Why|Reason)[:\s]+(.+)/i)
        if (explanationMatch) {
          question.explanation = explanationMatch[1].trim()
        }
      }

      if (options.length > 0) question.options = options
      if (question.type === 'true-false' && !question.options) {
        question.options = ['True', 'False']
      }

      if (question.question && question.correctAnswer) {
        parsed.push(question)
      }
    }

    return parsed
  }

  const handleGenerateQuiz = async () => {
    if (!material.trim()) {
      setError('Please enter study material or a topic')
      return
    }

    setLoading(true)
    setError('')
    setQuestions([])
    setUserAnswers([])
    setCurrentQuestion(0)

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
      const response = await generateAIResponse({
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
        subject: subject as 'math' | 'science' | 'ela' | 'social-studies',
        questionCount: numQuestions,
      })

      const parsedQuestions = parseQuestions(response)
      if (parsedQuestions.length === 0) {
        throw new Error('Could not parse questions. Please try again.')
      }

      setQuestions(parsedQuestions)
      setUserAnswers(parsedQuestions.map(q => ({ questionId: q.id, answer: '', answerText: '' })))
      setQuizMode('quiz')

      // Save to history
      await saveQuizToHistory(material, parsedQuestions, subject)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleQuizAnswer = (answer: string, answerText?: string) => {
    const question = questions[currentQuestion]
    let text = answerText || answer

    if (question.options && answer.length === 1) {
      const letterIndex = answer.toUpperCase().charCodeAt(0) - 65
      if (letterIndex >= 0 && letterIndex < question.options.length) {
        text = question.options[letterIndex]
      }
    }

    setUserAnswers(prev =>
      prev.map(ua =>
        ua.questionId === question.id
          ? { ...ua, answer, answerText: text }
          : ua
      )
    )
  }

  const isAnswerCorrect = (question: Question): boolean => {
    const ua = userAnswers.find(a => a.questionId === question.id)
    if (!ua || !ua.answer) return false

    const userLetter = ua.answer.toUpperCase().trim()
    const userText = ua.answerText.toLowerCase().trim()
    const correctAnswer = question.correctAnswer.toLowerCase().trim()

    if (question.options) {
      const correctLetter = correctAnswer.charAt(0).toUpperCase()
      if (userLetter === correctLetter) return true
      if (correctAnswer.includes(userText) || userText.includes(correctAnswer.replace(/^[a-d][.):\s]*/i, ''))) {
        return true
      }
    }

    if (question.type === 'true-false') {
      return userText === correctAnswer || userLetter.toLowerCase() === correctAnswer
    }

    return userText === correctAnswer || correctAnswer.includes(userText)
  }

  const calculateScore = () => questions.filter(q => isAnswerCorrect(q)).length

  const getCorrectAnswerText = (question: Question): string => {
    const correctAnswer = question.correctAnswer.trim()
    if (question.options && correctAnswer.length <= 2) {
      const letterMatch = correctAnswer.match(/^([A-D])/i)
      if (letterMatch) {
        const letterIndex = letterMatch[1].toUpperCase().charCodeAt(0) - 65
        if (letterIndex >= 0 && letterIndex < question.options.length) {
          return `${letterMatch[1].toUpperCase()}) ${question.options[letterIndex]}`
        }
      }
    }
    const fullMatch = correctAnswer.match(/^([A-D])[.):\s]*(.+)/i)
    if (fullMatch) return `${fullMatch[1].toUpperCase()}) ${fullMatch[2]}`
    return correctAnswer
  }

  // ============ FLASHCARD FUNCTIONS ============
  const parseFlashcards = (response: string): Flashcard[] => {
    const cleanResponse = response.replace(/\*\*/g, '').replace(/\*/g, '').trim()
    const parsed: Flashcard[] = []
    const cardBlocks = cleanResponse.split(/(?=(?:Card\s*\d+|Flashcard\s*\d+|\d+[.)]\s*Front))/i).filter(b => b.trim())

    let id = 0
    for (const block of cardBlocks) {
      const lines = block.split('\n').filter(l => l.trim())
      if (lines.length === 0) continue

      let front = ''
      let back = ''

      for (const line of lines) {
        const frontMatch = line.match(/^(?:Front|Question|Q)[:\s]+(.+)/i)
        const backMatch = line.match(/^(?:Back|Answer|A)[:\s]+(.+)/i)
        if (frontMatch) front = frontMatch[1].trim()
        else if (backMatch) back = backMatch[1].trim()
      }

      if (!front && !back && lines.length >= 2) {
        const firstLine = lines[0].replace(/^(?:Card\s*\d+|Flashcard\s*\d+|\d+[.):])\s*/i, '').trim()
        if (firstLine) {
          front = firstLine
          back = lines.slice(1).join(' ').trim()
        }
      }

      if (front && back) {
        id++
        parsed.push({ id, front, back })
      }
    }

    return parsed
  }

  const handleGenerateFlashcards = async () => {
    if (!material.trim()) {
      setError('Please enter study material or a topic')
      return
    }

    setLoading(true)
    setError('')
    setCards([])
    setCurrentCard(0)
    setIsFlipped(false)
    setKnownCards(new Set())

    const numCards = parseInt(cardCount)

    try {
      const response = await generateAIResponse({
        feature: 'flashcards',
        input: `Generate exactly ${numCards} flashcards about this topic/material.

Format each flashcard EXACTLY like this:

Card 1
Front: [Question or term]
Back: [Answer or definition]

Card 2
Front: [Question or term]
Back: [Answer or definition]

Make the front concise (a question, term, or concept) and the back a clear, memorable answer.

Topic/Material:
${material}`,
        subject: subject as 'math' | 'science' | 'ela' | 'social-studies',
      })

      const parsedCards = parseFlashcards(response)
      if (parsedCards.length === 0) {
        throw new Error('Could not parse flashcards. Please try again.')
      }

      setCards(parsedCards)
      setFlashcardMode('study')

      // Save to history
      await saveFlashcardsToHistory(material, parsedCards, subject)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ============ NOTES FUNCTIONS ============
  const parseNotes = (response: string): GeneratedNotes => {
    const cleanResponse = response.replace(/\*\*/g, '').replace(/\*/g, '').trim()
    const lines = cleanResponse.split('\n').filter(l => l.trim())

    const notes: GeneratedNotes = {
      title: '',
      sections: [],
      keyTerms: [],
    }

    let currentSection: NotesSection | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (!notes.title && (line.startsWith('#') || i === 0)) {
        notes.title = line.replace(/^#+\s*/, '').replace(/^Title:\s*/i, '')
        continue
      }

      const sectionMatch = line.match(/^(?:#{1,3}\s*|Section\s*\d*[:\s]*|[IVX]+\.\s*)(.+)/i)
      if (sectionMatch && !line.startsWith('-') && !line.startsWith('•')) {
        if (currentSection) notes.sections.push(currentSection)
        currentSection = { title: sectionMatch[1].trim(), content: [] }
        continue
      }

      const termMatch = line.match(/^(?:Key Term|Term)[:\s]*(.+?)[:\s]+(.+)/i)
      if (termMatch) {
        notes.keyTerms?.push({ term: termMatch[1].trim(), definition: termMatch[2].trim() })
        continue
      }

      if (line.toLowerCase().startsWith('summary:')) {
        notes.summary = line.replace(/^summary:\s*/i, '')
        continue
      }

      if (currentSection) {
        const contentLine = line.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim()
        if (contentLine) currentSection.content.push(contentLine)
      } else if (line && !notes.sections.length) {
        currentSection = {
          title: 'Main Points',
          content: [line.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim()],
        }
      }
    }

    if (currentSection) notes.sections.push(currentSection)
    if (!notes.title && notes.sections.length > 0) notes.title = 'Study Notes'

    return notes
  }

  const getStylePrompt = (style: string): string => {
    switch (style) {
      case 'outline':
        return `Create organized study notes in OUTLINE format with clear main topics (I, II, III), subtopics (A, B, C), and supporting details (1, 2, 3).`
      case 'cornell':
        return `Create study notes in CORNELL NOTE format with main notes section, key terms/questions in a side column format, and a summary section.`
      case 'bullet':
        return `Create study notes in BULLET POINT format with concise bullet points grouped by topic.`
      case 'summary':
        return `Create study notes as a SUMMARY with KEY POINTS: brief paragraph summaries and highlighted key concepts.`
      default:
        return 'Create organized study notes'
    }
  }

  const handleGenerateNotes = async () => {
    if (!material.trim()) {
      setError('Please enter study material or a topic')
      return
    }

    setLoading(true)
    setError('')
    setNotes(null)

    const stylePrompt = getStylePrompt(noteStyle)

    try {
      const response = await generateAIResponse({
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
        subject: subject as 'math' | 'science' | 'ela' | 'social-studies',
      })

      const parsedNotes = parseNotes(response)
      if (!parsedNotes.sections.length) {
        throw new Error('Could not parse notes. Please try again.')
      }

      setNotes(parsedNotes)
      setNotesMode('view')

      // Save to history
      await saveNotesToHistory(material, parsedNotes, subject, noteStyle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyNotes = () => {
    if (!notes) return
    let text = `# ${notes.title}\n\n`
    for (const section of notes.sections) {
      text += `## ${section.title}\n`
      for (const point of section.content) text += `- ${point}\n`
      text += '\n'
    }
    if (notes.keyTerms && notes.keyTerms.length > 0) {
      text += `## Key Terms\n`
      for (const term of notes.keyTerms) text += `- ${term.term}: ${term.definition}\n`
      text += '\n'
    }
    if (notes.summary) text += `## Summary\n${notes.summary}\n`
    navigator.clipboard.writeText(text)
  }

  // ============ RESET FUNCTIONS ============
  const resetQuiz = () => {
    setQuizMode('input')
    setQuestions([])
    setUserAnswers([])
    setCurrentQuestion(0)
  }

  const resetFlashcards = () => {
    setFlashcardMode('input')
    setCards([])
    setCurrentCard(0)
    setIsFlipped(false)
    setKnownCards(new Set())
  }

  const resetNotes = () => {
    setNotesMode('input')
    setNotes(null)
  }

  const resetAll = () => {
    setSubject('')
    setMaterial('')
    setError('')
    setQuestionType('')
    setQuestionCount('')
    setDifficulty('')
    setCardCount('')
    setNoteStyle('')
    resetQuiz()
    resetFlashcards()
    resetNotes()
  }

  const handleToolChange = (tool: StudyTool) => {
    setActiveTool(tool)
    setError('')
  }

  // ============ DERIVED STATE ============
  const currentQuizAnswer = userAnswers.find(ua => ua.questionId === questions[currentQuestion]?.id)?.answer || ''
  const answeredCount = userAnswers.filter(ua => ua.answer !== '').length
  const flashcardProgress = cards.length > 0 ? (knownCards.size / cards.length) * 100 : 0

  // ============ RENDER ============
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Study Materials</h1>
        <p className="text-text-secondary mt-2">
          Generate quizzes, flashcards, and notes from any topic or study material.
        </p>
      </div>

      {/* Tool Selector Tabs */}
      <div className="flex gap-2 p-1 bg-bg-secondary rounded-xl">
        <button
          onClick={() => handleToolChange('quiz')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
            activeTool === 'quiz'
              ? 'bg-amber-500 text-white shadow-md'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span>Quiz</span>
        </button>
        <button
          onClick={() => handleToolChange('flashcards')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
            activeTool === 'flashcards'
              ? 'bg-accent-purple text-white shadow-md'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span>Flashcards</span>
        </button>
        <button
          onClick={() => handleToolChange('notes')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
            activeTool === 'notes'
              ? 'bg-accent-blue text-white shadow-md'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Notes</span>
        </button>
      </div>

      {/* ============ QUIZ TOOL ============ */}
      {activeTool === 'quiz' && (
        <>
          {quizMode === 'input' && (
            <>
            <Card className="overflow-hidden border-2 border-border-default hover:border-amber-500/30 transition-colors">
              <div className="bg-gradient-to-r from-amber-500/10 to-transparent px-6 py-4 border-b border-border-default">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Create a Quiz</h2>
                    <p className="text-sm text-text-muted">Generate practice questions to test your knowledge</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Select label="Subject" options={subjects} value={subject} onChange={(e) => setSubject(e.target.value)} />
                  <Select label="Question Type" options={questionTypes} value={questionType} onChange={(e) => setQuestionType(e.target.value)} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Select label="Number of Questions" options={questionCounts} value={questionCount} onChange={(e) => setQuestionCount(e.target.value)} />
                  <Select label="Difficulty" options={difficulties} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} />
                </div>
                <Textarea
                  label="Topic or Study Material"
                  placeholder="Enter what you want to be quizzed on..."
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  rows={6}
                  error={error}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleGenerateQuiz}
                    loading={loading}
                    disabled={!subject || !questionType || !questionCount || !difficulty || !material.trim()}
                  >
                    Generate Quiz
                  </Button>
                </div>
              </div>
            </Card>
            </>
          )}

          {quizMode === 'quiz' && questions.length > 0 && (
            <div className="space-y-5">
              <Card className="bg-bg-secondary border-amber-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-text-muted text-xs font-medium uppercase">Quiz Progress</span>
                  <Button variant="ghost" size="sm" onClick={resetQuiz}>New Quiz</Button>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl font-bold text-amber-500">{answeredCount}/{questions.length}</span>
                  <span className="text-sm text-text-muted">{Math.round((answeredCount / questions.length) * 100)}%</span>
                </div>
                <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
                </div>
              </Card>

              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {questions.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentQuestion(index)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      index === currentQuestion
                        ? 'bg-amber-500 text-white shadow-md'
                        : userAnswers[index]?.answer
                        ? 'bg-accent-green text-white'
                        : 'bg-bg-secondary text-text-muted border border-border-default'
                    }`}
                  >
                    {userAnswers[index]?.answer && index !== currentQuestion ? '✓' : index + 1}
                  </button>
                ))}
              </div>

              <Card className="border border-amber-500/30">
                <div className="bg-gradient-to-r from-amber-500/10 to-transparent p-5 border-b border-amber-500/20">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">{currentQuestion + 1}</span>
                    </div>
                    <div>
                      <span className="text-amber-500 text-xs font-medium">Question {currentQuestion + 1} of {questions.length}</span>
                      <h3 className="text-lg font-semibold text-text-primary mt-0.5">{questions[currentQuestion].question}</h3>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  {questions[currentQuestion].options?.map((option, index) => {
                    const letter = String.fromCharCode(65 + index)
                    const isSelected = currentQuizAnswer.toLowerCase() === letter.toLowerCase()
                    return (
                      <button
                        key={index}
                        onClick={() => handleQuizAnswer(letter)}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                          isSelected ? 'bg-amber-500/20 border-amber-500' : 'bg-bg-secondary border-border-default hover:border-amber-500/50'
                        }`}
                      >
                        <span className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold ${isSelected ? 'bg-amber-500 text-white' : 'bg-bg-card text-text-muted'}`}>
                          {letter}
                        </span>
                        <span className={isSelected ? 'text-text-primary' : 'text-text-secondary'}>{option}</span>
                      </button>
                    )
                  })}

                  <div className="flex items-center justify-between pt-4 border-t border-border-default">
                    <Button variant="secondary" size="sm" onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))} disabled={currentQuestion === 0}>
                      Back
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => currentQuestion === questions.length - 1 ? setQuizMode('results') : setCurrentQuestion(currentQuestion + 1)}
                      disabled={currentQuestion === questions.length - 1 && answeredCount < questions.length}
                    >
                      {currentQuestion === questions.length - 1 ? 'Submit Quiz' : 'Next'}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {quizMode === 'results' && (
            <div className="space-y-4">
              <Card className={`border text-center py-6 ${calculateScore() >= questions.length * 0.7 ? 'border-accent-green/30 bg-accent-green/10' : calculateScore() >= questions.length * 0.5 ? 'border-amber-500/30 bg-amber-500/10' : 'border-error/30 bg-error/10'}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${calculateScore() >= questions.length * 0.7 ? 'bg-accent-green/20' : calculateScore() >= questions.length * 0.5 ? 'bg-amber-500/20' : 'bg-error/20'}`}>
                  <span className={`text-3xl font-bold ${calculateScore() >= questions.length * 0.7 ? 'text-accent-green' : calculateScore() >= questions.length * 0.5 ? 'text-amber-500' : 'text-error'}`}>
                    {Math.round((calculateScore() / questions.length) * 100)}%
                  </span>
                </div>
                <h2 className="text-xl font-bold text-text-primary">{calculateScore() >= questions.length * 0.7 ? 'Excellent!' : calculateScore() >= questions.length * 0.5 ? 'Good Job!' : 'Keep Practicing!'}</h2>
                <p className="text-text-muted text-sm mt-1">{calculateScore()} out of {questions.length} correct</p>
              </Card>

              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => { setUserAnswers(questions.map(q => ({ questionId: q.id, answer: '', answerText: '' }))); setCurrentQuestion(0); setQuizMode('quiz'); }}>Try Again</Button>
                <Button className="flex-1" onClick={resetQuiz}>New Quiz</Button>
              </div>

              <Card>
                <h3 className="font-medium text-text-primary mb-3">Review Answers</h3>
                <div className="space-y-2">
                  {questions.map((question, index) => {
                    const ua = userAnswers.find(a => a.questionId === question.id)
                    const correct = isAnswerCorrect(question)
                    const userAnswerDisplay = ua?.answer ? (question.options && ua.answer.length === 1 ? `${ua.answer.toUpperCase()}) ${ua.answerText}` : ua.answerText || ua.answer) : 'No answer'

                    return (
                      <div key={question.id} className={`border rounded-lg overflow-hidden ${correct ? 'border-accent-green/30' : 'border-error/30'}`}>
                        <div className={`px-4 py-2 ${correct ? 'bg-accent-green/10' : 'bg-error/10'} flex items-center gap-3`}>
                          <span className={`text-sm font-medium ${correct ? 'text-accent-green' : 'text-error'}`}>Q{index + 1}: {correct ? 'Correct' : 'Incorrect'}</span>
                        </div>
                        <div className="p-4 space-y-3">
                          <p className="text-text-primary text-sm">{question.question}</p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <div className={`p-3 rounded-lg text-sm ${correct ? 'bg-accent-green/10' : 'bg-error/10'}`}>
                              <p className="text-xs text-text-muted mb-1">Your Answer</p>
                              <p className={`font-medium ${correct ? 'text-accent-green' : 'text-error'}`}>{userAnswerDisplay}</p>
                            </div>
                            {!correct && (
                              <div className="p-3 rounded-lg bg-accent-green/10 text-sm">
                                <p className="text-xs text-text-muted mb-1">Correct Answer</p>
                                <p className="text-accent-green font-medium">{getCorrectAnswerText(question)}</p>
                              </div>
                            )}
                          </div>
                          {question.explanation && (
                            <div className="p-3 rounded-lg bg-accent-blue/10">
                              <p className="text-xs text-accent-blue mb-1">Explanation</p>
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
        </>
      )}

      {/* ============ FLASHCARDS TOOL ============ */}
      {activeTool === 'flashcards' && (
        <>
          {flashcardMode === 'input' && (
            <>
            <Card className="overflow-hidden border-2 border-border-default hover:border-accent-purple/30 transition-colors">
              <div className="bg-gradient-to-r from-accent-purple/10 to-transparent px-6 py-4 border-b border-border-default">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-purple/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Create Flashcards</h2>
                    <p className="text-sm text-text-muted">Generate flashcards for effective memorization</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Select label="Subject" options={subjects} value={subject} onChange={(e) => setSubject(e.target.value)} />
                  <Select label="Number of Cards" options={cardCounts} value={cardCount} onChange={(e) => setCardCount(e.target.value)} />
                </div>
                <Textarea
                  label="Topic or Study Material"
                  placeholder="Enter what you want to create flashcards for..."
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  rows={6}
                  error={error}
                />
                <div className="flex justify-end">
                  <Button onClick={handleGenerateFlashcards} loading={loading} disabled={!subject || !cardCount || !material.trim()}>
                    Generate Flashcards
                  </Button>
                </div>
              </div>
            </Card>
            </>
          )}

          {flashcardMode === 'study' && cards.length > 0 && (
            <div className="space-y-5">
              <Card className="bg-bg-secondary border-accent-purple/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-text-muted text-xs font-medium uppercase">Progress</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setCards([...cards].sort(() => Math.random() - 0.5)); setCurrentCard(0); setIsFlipped(false); }}>Shuffle</Button>
                    <Button variant="ghost" size="sm" onClick={resetFlashcards}>New Set</Button>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl font-bold text-accent-purple">{knownCards.size}/{cards.length}</span>
                  <span className="text-sm text-text-muted">{Math.round(flashcardProgress)}% mastered</span>
                </div>
                <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-accent-purple rounded-full transition-all" style={{ width: `${flashcardProgress}%` }} />
                </div>
              </Card>

              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {cards.map((card, index) => (
                  <button
                    key={card.id}
                    onClick={() => { setCurrentCard(index); setIsFlipped(false); }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      index === currentCard
                        ? 'bg-accent-purple text-white shadow-md'
                        : knownCards.has(card.id)
                        ? 'bg-accent-green text-white'
                        : 'bg-bg-secondary text-text-muted border border-border-default'
                    }`}
                  >
                    {knownCards.has(card.id) && index !== currentCard ? '✓' : index + 1}
                  </button>
                ))}
              </div>

              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="cursor-pointer"
                style={{ perspective: '1000px' }}
              >
                <div
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    transition: 'transform 0.5s',
                  }}
                >
                  <Card
                    className={`min-h-[280px] border-2 ${isFlipped ? 'border-accent-green/30' : 'border-accent-purple/30'} flex flex-col items-center justify-center p-8 text-center`}
                    style={{ backfaceVisibility: 'hidden' }}
                  >
                    {!isFlipped ? (
                      <>
                        <span className="text-accent-purple text-xs font-medium uppercase tracking-wide mb-4">Card {currentCard + 1} - Front</span>
                        <p className="text-xl font-semibold text-text-primary leading-relaxed">{cards[currentCard].front}</p>
                        <span className="text-text-muted text-sm mt-6">Click to flip</span>
                      </>
                    ) : (
                      <>
                        <span className="text-accent-green text-xs font-medium uppercase tracking-wide mb-4">Card {currentCard + 1} - Back</span>
                        <p className="text-xl font-semibold text-text-primary leading-relaxed">{cards[currentCard].back}</p>
                        <span className="text-text-muted text-sm mt-6">Click to flip back</span>
                      </>
                    )}
                  </Card>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="secondary" size="sm" onClick={() => { setCurrentCard(Math.max(0, currentCard - 1)); setIsFlipped(false); }} disabled={currentCard === 0}>Previous</Button>
                <div className="flex gap-2">
                  {knownCards.has(cards[currentCard].id) ? (
                    <Button variant="secondary" size="sm" onClick={() => { const newSet = new Set(knownCards); newSet.delete(cards[currentCard].id); setKnownCards(newSet); }}>Study Again</Button>
                  ) : (
                    <Button size="sm" className="bg-accent-green hover:bg-accent-green/90" onClick={() => { setKnownCards(new Set([...knownCards, cards[currentCard].id])); if (currentCard < cards.length - 1) { setCurrentCard(currentCard + 1); setIsFlipped(false); } }}>Got It!</Button>
                  )}
                </div>
                <Button variant="secondary" size="sm" onClick={() => { setCurrentCard(Math.min(cards.length - 1, currentCard + 1)); setIsFlipped(false); }} disabled={currentCard === cards.length - 1}>Next</Button>
              </div>

              {knownCards.size === cards.length && (
                <Card className="border-accent-green/30 bg-accent-green/10 text-center py-6">
                  <h3 className="text-xl font-bold text-text-primary mb-2">All Cards Mastered!</h3>
                  <p className="text-text-muted mb-4">Great job!</p>
                  <div className="flex gap-3 justify-center">
                    <Button variant="secondary" onClick={() => setKnownCards(new Set())}>Reset</Button>
                    <Button onClick={resetFlashcards}>New Set</Button>
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* ============ NOTES TOOL ============ */}
      {activeTool === 'notes' && (
        <>
          {notesMode === 'input' && (
            <>
            <Card className="overflow-hidden border-2 border-border-default hover:border-accent-blue/30 transition-colors">
              <div className="bg-gradient-to-r from-accent-blue/10 to-transparent px-6 py-4 border-b border-border-default">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-blue/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Generate Notes</h2>
                    <p className="text-sm text-text-muted">Create organized study notes from any content</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Select label="Subject" options={subjects} value={subject} onChange={(e) => setSubject(e.target.value)} />
                  <Select label="Note Style" options={noteStyles} value={noteStyle} onChange={(e) => setNoteStyle(e.target.value)} />
                </div>
                <Textarea
                  label="Topic or Content"
                  placeholder="Enter what you want to create notes for..."
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  rows={8}
                  error={error}
                />
                <div className="flex justify-end">
                  <Button onClick={handleGenerateNotes} loading={loading} disabled={!subject || !noteStyle || !material.trim()}>
                    Generate Notes
                  </Button>
                </div>
              </div>
            </Card>

            {/* Notes History Section */}
            {notesHistory.length > 0 && (
              <Card className="border-border-default">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-text-primary flex items-center gap-2">
                    <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recent Notes
                  </h3>
                  <span className="text-xs text-text-muted">{filteredNotesHistory.length} items</span>
                </div>

                <div className="relative mb-4">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-bg-secondary border border-border-default rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50"
                  />
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {historyLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => <div key={i} className="h-16 bg-bg-secondary rounded-lg animate-pulse" />)}
                    </div>
                  ) : filteredNotesHistory.length === 0 ? (
                    <p className="text-center text-text-muted py-4 text-sm">No notes found</p>
                  ) : (
                    filteredNotesHistory.map(item => (
                      <div
                        key={item.id}
                        onClick={() => loadNotesFromHistory(item)}
                        className="group p-3 rounded-lg bg-bg-secondary hover:bg-bg-elevated cursor-pointer transition-all border border-transparent hover:border-accent-blue/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-text-primary truncate">{item.notes_data.notes.title || item.material_preview}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-text-muted">{formatDate(item.created_at)}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-accent-blue/20 text-accent-blue capitalize">{item.notes_data.style}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-bg-card text-text-muted capitalize">{item.subject}</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteFromHistory(item.id, 'notes'); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-error/20 text-text-muted hover:text-error transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}
            </>
          )}

          {notesMode === 'view' && notes && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <Button variant="secondary" size="sm" onClick={resetNotes}>New Notes</Button>
                <Button variant="secondary" size="sm" onClick={handleCopyNotes}>Copy Notes</Button>
              </div>

              <Card className="border-accent-blue/30 bg-gradient-to-r from-accent-blue/10 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-accent-blue/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">{notes.title}</h2>
                    <p className="text-sm text-text-muted capitalize">{noteStyle} format</p>
                  </div>
                </div>
              </Card>

              {notes.sections.map((section, index) => (
                <Card key={index}>
                  <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-accent-blue/20 text-accent-blue flex items-center justify-center text-sm font-bold">{index + 1}</span>
                    {section.title}
                  </h3>
                  <ul className="space-y-2">
                    {section.content.map((point, i) => (
                      <li key={i} className="flex items-start gap-3 text-text-secondary">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-2 flex-shrink-0" />
                        <span className="leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}

              {notes.keyTerms && notes.keyTerms.length > 0 && (
                <Card className="border-purple-500/30">
                  <h3 className="text-lg font-semibold text-text-primary mb-3">Key Terms</h3>
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

              {notes.summary && (
                <Card className="border-accent-blue/30 bg-accent-blue/5">
                  <h3 className="text-lg font-semibold text-text-primary mb-2">Summary</h3>
                  <p className="text-text-secondary leading-relaxed">{notes.summary}</p>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
