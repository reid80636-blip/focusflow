'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, Button } from '@/components/ui'
import Link from 'next/link'

interface StudySession {
  id: string
  feature_type: string
  subject: string | null
  input_text: string
  output_text: string
  created_at: string
}

const featureNames: Record<string, string> = {
  solver: 'Problem Solver',
  explainer: 'Concept Explainer',
  summarizer: 'Summarizer',
  questions: 'Question Generator',
}

const featureColors: Record<string, string> = {
  solver: 'bg-accent-blue/20 text-accent-blue',
  explainer: 'bg-accent-purple/20 text-accent-purple',
  summarizer: 'bg-accent-green/20 text-accent-green',
  questions: 'bg-amber-500/20 text-amber-500',
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchSessions = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('study_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (fetchError) {
        setError('Failed to load history')
        console.error('Fetch error:', fetchError.message)
      } else {
        setSessions(data || [])
      }

      setLoading(false)
    }

    fetchSessions()
  }, [supabase])

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('study_sessions')
      .delete()
      .eq('id', id)

    if (!error) {
      setSessions(sessions.filter((s) => s.id !== id))
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const truncateText = (text: string, length: number) => {
    if (text.length <= length) return text
    return text.substring(0, length) + '...'
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-text-primary">Study History</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-card border border-border-default rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-bg-elevated rounded w-1/4 mb-4"></div>
              <div className="h-3 bg-bg-elevated rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-bg-elevated rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!sessions.length && !error) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-text-primary">Study History</h1>
        <Card className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-bg-secondary flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">No History Yet</h2>
          <p className="text-text-secondary mb-6">
            Your study sessions will appear here once you start using the tools.
          </p>
          <Link href="/">
            <Button>Start Studying</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Study History</h1>
        <p className="text-text-secondary mt-2">
          Review your past study sessions
        </p>
      </div>

      {error && (
        <p className="text-error">{error}</p>
      )}

      <div className="space-y-4">
        {sessions.map((session) => (
          <Card key={session.id} className="overflow-hidden">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${featureColors[session.feature_type]}`}>
                    {featureNames[session.feature_type]}
                  </span>
                  {session.subject && (
                    <span className="text-text-muted text-sm">
                      {session.subject.replace('-', ' ')}
                    </span>
                  )}
                </div>
                <span className="text-text-muted text-sm">
                  {formatDate(session.created_at)}
                </span>
              </div>

              <div>
                <p className="text-text-secondary text-sm font-medium mb-1">Input:</p>
                <p className="text-text-primary">
                  {expandedId === session.id
                    ? session.input_text
                    : truncateText(session.input_text, 200)}
                </p>
              </div>

              {expandedId === session.id && (
                <div className="pt-4 border-t border-border-default">
                  <p className="text-text-secondary text-sm font-medium mb-1">Response:</p>
                  <p className="text-text-primary whitespace-pre-wrap">
                    {session.output_text}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                >
                  {expandedId === session.id ? 'Show Less' : 'Show More'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(session.id)}
                  className="text-error hover:text-error"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
