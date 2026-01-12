'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Select, Textarea } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { generateAIResponse } from '@/lib/ai-client'

const subjects = [
  { value: '', label: 'Select a subject...' },
  { value: 'math', label: 'Math' },
  { value: 'science', label: 'Science' },
  { value: 'ela', label: 'English Language Arts' },
  { value: 'social-studies', label: 'Social Studies' },
]

const cardCounts = [
  { value: '', label: 'Select number...' },
  { value: '5', label: '5 Flashcards' },
  { value: '10', label: '10 Flashcards' },
  { value: '15', label: '15 Flashcards' },
  { value: '20', label: '20 Flashcards' },
]

interface Flashcard {
  id: number
  front: string
  back: string
}

interface FlashcardSet {
  cards: Flashcard[]
  material: string
}

interface SavedSet {
  id: string
  material_preview: string
  subject: string
  flashcard_data: FlashcardSet
  created_at: string
}

export default function FlashcardsPage() {
  // Form state
  const [subject, setSubject] = useState('')
  const [cardCount, setCardCount] = useState('')
  const [material, setMaterial] = useState('')

  // Flashcard state
  const [cards, setCards] = useState<Flashcard[]>([])
  const [currentCard, setCurrentCard] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'input' | 'study'>('input')
  const [knownCards, setKnownCards] = useState<Set<number>>(new Set())

  // History state
  const [history, setHistory] = useState<SavedSet[]>([])
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
          .eq('feature_type', 'flashcards')
          .order('created_at', { ascending: false })
          .limit(20)

        if (!fetchError && data) {
          const parsed: SavedSet[] = data
            .map(item => {
              try {
                return {
                  id: item.id,
                  material_preview: item.input_text.substring(0, 100),
                  subject: item.subject || 'general',
                  flashcard_data: JSON.parse(item.output_text),
                  created_at: item.created_at,
                }
              } catch {
                return null
              }
            })
            .filter((item): item is SavedSet => item !== null)
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
  const saveFlashcards = async (materialText: string, flashcards: Flashcard[], subj: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const flashcardData: FlashcardSet = {
        cards: flashcards,
        material: materialText,
      }

      const { data: inserted, error: insertError } = await supabase
        .from('study_sessions')
        .insert({
          user_id: session.user.id,
          feature_type: 'flashcards',
          subject: subj,
          input_text: materialText,
          output_text: JSON.stringify(flashcardData),
        })
        .select()
        .single()

      if (!insertError && inserted) {
        const newItem: SavedSet = {
          id: inserted.id,
          material_preview: materialText.substring(0, 100),
          subject: subj,
          flashcard_data: flashcardData,
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
  const loadFromHistory = (item: SavedSet) => {
    setMaterial(item.flashcard_data.material)
    setSubject(item.subject)
    setCards(item.flashcard_data.cards)
    setCurrentCard(0)
    setIsFlipped(false)
    setKnownCards(new Set())
    setSelectedHistoryId(item.id)
    setError('')
    setMode('study')
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

  const parseFlashcards = (response: string): Flashcard[] => {
    const cleanResponse = response
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .trim()

    const parsed: Flashcard[] = []

    // Split by card patterns
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

        if (frontMatch) {
          front = frontMatch[1].trim()
        } else if (backMatch) {
          back = backMatch[1].trim()
        }
      }

      // Fallback: if no explicit front/back, try to parse differently
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

  const handleGenerate = async () => {
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
    setSelectedHistoryId(null)

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
      setMode('study')

      // Save to Supabase
      await saveFlashcards(material, parsedCards, subject)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  const handleNext = () => {
    if (currentCard < cards.length - 1) {
      setCurrentCard(currentCard + 1)
      setIsFlipped(false)
    }
  }

  const handlePrev = () => {
    if (currentCard > 0) {
      setCurrentCard(currentCard - 1)
      setIsFlipped(false)
    }
  }

  const handleKnown = () => {
    setKnownCards(prev => new Set([...prev, cards[currentCard].id]))
    if (currentCard < cards.length - 1) {
      setCurrentCard(currentCard + 1)
      setIsFlipped(false)
    }
  }

  const handleStudyAgain = () => {
    setKnownCards(prev => {
      const newSet = new Set(prev)
      newSet.delete(cards[currentCard].id)
      return newSet
    })
  }

  const handleNewSet = () => {
    setMode('input')
    setCards([])
    setCurrentCard(0)
    setIsFlipped(false)
    setKnownCards(new Set())
    setMaterial('')
    setSubject('')
    setCardCount('')
    setSelectedHistoryId(null)
  }

  const handleShuffle = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    setCards(shuffled)
    setCurrentCard(0)
    setIsFlipped(false)
  }

  const remainingCards = cards.filter(c => !knownCards.has(c.id))
  const progress = cards.length > 0 ? (knownCards.size / cards.length) * 100 : 0

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
          <div className="fixed top-20 right-4 w-80 max-h-[calc(100vh-120px)] z-40">
            <Card className="p-4 shadow-xl border-accent-purple/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-text-primary flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recent Sets
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
                          ? 'bg-accent-purple/20 border border-accent-purple/30'
                          : 'bg-bg-secondary hover:bg-bg-elevated border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${
                            selectedHistoryId === item.id ? 'text-accent-purple' : 'text-text-primary'
                          }`}>
                            {item.material_preview.substring(0, 50)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted">
                              {formatDate(item.created_at)}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
                              {item.flashcard_data.cards.length} cards
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
          <h1 className="text-3xl font-bold text-text-primary">Flashcards</h1>
          <p className="text-text-secondary mt-2">
            Generate flashcards from any topic or study material for effective memorization.
          </p>
        </div>

        {/* Input Mode */}
        {mode === 'input' && (
          <Card className="overflow-hidden border-2 border-border-default hover:border-accent-purple/30 transition-colors duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-accent-purple/10 to-transparent px-6 py-4 border-b border-border-default">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-purple/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Create Flashcards</h2>
                  <p className="text-sm text-text-muted">Enter a topic or paste study material to generate flashcards</p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="p-6 space-y-6">
              {/* Row 1: Subject & Card Count */}
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
                  label="Number of Cards"
                  options={cardCounts}
                  value={cardCount}
                  onChange={(e) => setCardCount(e.target.value)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                  }
                />
              </div>

              {/* Material Input */}
              <Textarea
                label="Topic or Study Material"
                placeholder="Enter what you want to create flashcards for...

Examples:
- Spanish vocabulary for travel
- Key events of World War II
- Or paste your notes, textbook excerpt, or study guide here"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                rows={6}
                hint="The more detail you provide, the better your flashcards will be"
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
                  disabled={!subject || !cardCount || !material.trim()}
                  className="px-8"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Generate Flashcards
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Study Mode */}
        {mode === 'study' && cards.length > 0 && (
          <div className="space-y-5">
            {/* Progress Section */}
            <div className="bg-bg-card rounded-xl p-4 border border-border-default">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-accent-purple">{knownCards.size}</span>
                  <span className="text-text-muted text-sm">of {cards.length} mastered</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleShuffle}>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Shuffle
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleNewSet}>
                    New Set
                  </Button>
                </div>
              </div>
              <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent-purple to-accent-purple rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Card Indicators */}
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {cards.map((card, index) => (
                <button
                  key={card.id}
                  onClick={() => {
                    setCurrentCard(index)
                    setIsFlipped(false)
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
                    index === currentCard
                      ? 'bg-gradient-to-br from-accent-purple to-accent-purple text-white shadow-md'
                      : knownCards.has(card.id)
                      ? 'bg-accent-green text-white'
                      : 'bg-bg-secondary text-text-muted border border-border-default hover:border-accent-purple/50'
                  } cursor-pointer hover:scale-105`}
                >
                  {knownCards.has(card.id) && index !== currentCard ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </button>
              ))}
            </div>

            {/* Flashcard */}
            <div className="perspective-1000">
              <div
                onClick={handleFlip}
                className={`relative w-full min-h-[300px] cursor-pointer transition-transform duration-500 transform-style-preserve-3d ${
                  isFlipped ? 'rotate-y-180' : ''
                }`}
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* Front */}
                <Card
                  className={`absolute inset-0 border-2 border-accent-purple/30 flex flex-col items-center justify-center p-8 text-center backface-hidden ${
                    isFlipped ? 'invisible' : ''
                  }`}
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <span className="text-accent-purple text-xs font-medium uppercase tracking-wide mb-4">
                    Card {currentCard + 1} of {cards.length} - Front
                  </span>
                  <p className="text-xl font-semibold text-text-primary leading-relaxed">
                    {cards[currentCard].front}
                  </p>
                  <span className="text-text-muted text-sm mt-6">Click to flip</span>
                </Card>

                {/* Back */}
                <Card
                  className={`absolute inset-0 border-2 border-accent-green/30 bg-gradient-to-br from-accent-green/5 to-transparent flex flex-col items-center justify-center p-8 text-center ${
                    !isFlipped ? 'invisible' : ''
                  }`}
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <span className="text-accent-green text-xs font-medium uppercase tracking-wide mb-4">
                    Card {currentCard + 1} of {cards.length} - Back
                  </span>
                  <p className="text-xl font-semibold text-text-primary leading-relaxed">
                    {cards[currentCard].back}
                  </p>
                  <span className="text-text-muted text-sm mt-6">Click to flip back</span>
                </Card>
              </div>
            </div>

            {/* Navigation & Actions */}
            <div className="flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrev}
                disabled={currentCard === 0}
                className="gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </Button>

              <div className="flex gap-2">
                {knownCards.has(cards[currentCard].id) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleStudyAgain}
                    className="gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Study Again
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleKnown}
                    className="gap-1.5 bg-accent-green hover:bg-accent-green/90"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Got It!
                  </Button>
                )}
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleNext}
                disabled={currentCard === cards.length - 1}
                className="gap-1.5"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            </div>

            {/* Completion Message */}
            {knownCards.size === cards.length && (
              <Card className="border-accent-green/30 bg-gradient-to-r from-accent-green/10 to-transparent text-center py-6">
                <div className="w-16 h-16 rounded-full bg-accent-green/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">All Cards Mastered!</h3>
                <p className="text-text-muted mb-4">Great job! You&apos;ve gone through all {cards.length} flashcards.</p>
                <div className="flex gap-3 justify-center">
                  <Button variant="secondary" onClick={() => setKnownCards(new Set())}>
                    Reset Progress
                  </Button>
                  <Button onClick={handleNewSet}>
                    Create New Set
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
