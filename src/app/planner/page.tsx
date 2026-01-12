'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { generateAIResponse } from '@/lib/ai-client'

interface Task {
  id: string
  title: string
  description?: string
  date: string
  time?: string
  duration: number
  subject?: string
  completed: boolean
  created_at: string
}

interface ParsedTask {
  title: string
  date: string
  time: string | null
  duration: number
  subject: string
  confidence: number
}

const subjects = [
  { value: 'math', label: 'Math', color: 'bg-accent-green', lightColor: 'bg-accent-green/20', textColor: 'text-accent-green', borderColor: 'border-accent-green' },
  { value: 'science', label: 'Science', color: 'bg-accent-blue', lightColor: 'bg-accent-blue/20', textColor: 'text-accent-blue', borderColor: 'border-accent-blue' },
  { value: 'ela', label: 'English', color: 'bg-accent-purple', lightColor: 'bg-accent-purple/20', textColor: 'text-accent-purple', borderColor: 'border-accent-purple' },
  { value: 'social-studies', label: 'History', color: 'bg-amber-500', lightColor: 'bg-amber-500/20', textColor: 'text-amber-500', borderColor: 'border-amber-500' },
  { value: 'general', label: 'General', color: 'bg-text-muted', lightColor: 'bg-text-muted/20', textColor: 'text-text-muted', borderColor: 'border-text-muted' },
]

const getSubject = (subject?: string) => {
  return subjects.find(s => s.value === subject) || subjects[4]
}

// Date utilities
const getWeekStart = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const formatDate = (date: Date): string => date.toISOString().split('T')[0]

const getWeekDays = (startDate: Date): Date[] => {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    return day
  })
}

const getMonthDays = (year: number, month: number): (Date | null)[] => {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPadding = (firstDay.getDay() + 6) % 7 // Monday = 0
  const days: (Date | null)[] = Array(startPadding).fill(null)

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }

  return days
}

const formatTime12 = (time24: string): string => {
  const [hours, minutes] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  return minutes === 0 ? `${hours12}${period}` : `${hours12}:${minutes.toString().padStart(2, '0')}${period}`
}

const dayNamesShort = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Time slots from 6 AM to 10 PM
const timeSlots = Array.from({ length: 17 }, (_, i) => i + 6)

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()))
  const [showAddModal, setShowAddModal] = useState(false)
  const [showMiniCalendar, setShowMiniCalendar] = useState(false)
  const [miniCalMonth, setMiniCalMonth] = useState(() => new Date().getMonth())
  const [miniCalYear, setMiniCalYear] = useState(() => new Date().getFullYear())

  // AI input state
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPreview, setAiPreview] = useState<ParsedTask | null>(null)

  // New task form state
  const [newTask, setNewTask] = useState({
    title: '',
    subject: 'general',
    time: '',
    duration: 60,
    date: '',
  })

  const supabase = createClient()
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const today = formatDate(new Date())
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  // Fetch tasks for the visible range
  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setLoading(false)
          return
        }

        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 6)

        const { data, error } = await supabase
          .from('planner_tasks')
          .select('*')
          .gte('date', formatDate(weekStart))
          .lte('date', formatDate(weekEnd))
          .order('time', { ascending: true })

        if (!error && data) {
          setTasks(data.map(t => ({ ...t, duration: t.duration || 60 })))
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [weekStart, supabase])

  // Navigation
  const goToPrevWeek = () => {
    const newStart = new Date(weekStart)
    newStart.setDate(newStart.getDate() - 7)
    setWeekStart(newStart)
  }

  const goToNextWeek = () => {
    const newStart = new Date(weekStart)
    newStart.setDate(newStart.getDate() + 7)
    setWeekStart(newStart)
  }

  const goToThisWeek = () => {
    setWeekStart(getWeekStart(new Date()))
    setSelectedDate(formatDate(new Date()))
  }

  const selectDateFromCalendar = (date: Date) => {
    setSelectedDate(formatDate(date))
    setWeekStart(getWeekStart(date))
    setShowMiniCalendar(false)
  }

  // Task operations
  const handleAddTask = async () => {
    if (!newTask.title.trim() || !newTask.date) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data, error } = await supabase
        .from('planner_tasks')
        .insert({
          user_id: session.user.id,
          title: newTask.title.trim(),
          date: newTask.date,
          time: newTask.time || null,
          duration: newTask.duration,
          subject: newTask.subject,
          completed: false,
        })
        .select()
        .single()

      if (!error && data) {
        setTasks(prev => [...prev, { ...data, duration: data.duration || 60 }])
      }
    } catch {
      // Silently fail
    }

    setNewTask({ title: '', subject: 'general', time: '', duration: 60, date: '' })
    setShowAddModal(false)
    setAiPreview(null)
    setAiInput('')
  }

  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from('planner_tasks')
        .update({ completed: !completed })
        .eq('id', taskId)

      if (!error) {
        setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, completed: !completed } : t)))
      }
    } catch {
      // Silently fail
    }
  }

  const deleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('planner_tasks')
        .delete()
        .eq('id', taskId)

      if (!error) {
        setTasks(prev => prev.filter(t => t.id !== taskId))
      }
    } catch {
      // Silently fail
    }
  }

  const getTasksForDay = useCallback((date: string): Task[] => {
    return tasks.filter(t => t.date === date).sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    })
  }, [tasks])

  // AI Parse
  const handleAIParse = async () => {
    if (!aiInput.trim()) return

    setAiLoading(true)
    try {
      const response = await generateAIResponse({
        feature: 'planner',
        input: aiInput,
      })

      const parsed = JSON.parse(response)
      setAiPreview(parsed)
      setNewTask({
        title: parsed.title,
        date: parsed.date,
        time: parsed.time || '',
        duration: parsed.duration || 60,
        subject: parsed.subject || 'general',
      })
    } catch {
      // Silently fail
    } finally {
      setAiLoading(false)
    }
  }

  const openAddModal = (date: string, time?: string) => {
    setNewTask({
      title: '',
      subject: 'general',
      time: time || '',
      duration: 60,
      date: date,
    })
    setShowAddModal(true)
  }

  // Calculate stats
  const weekStats = useMemo(() => {
    const completed = tasks.filter(t => t.completed).length
    const total = tasks.length
    const totalMinutes = tasks.reduce((acc, t) => acc + (t.duration || 60), 0)
    const completedMinutes = tasks.filter(t => t.completed).reduce((acc, t) => acc + (t.duration || 60), 0)
    return { completed, total, totalMinutes, completedMinutes }
  }, [tasks])

  // Get tasks that have a time for timeline view
  const getTimelineTasks = useCallback((date: string) => {
    return tasks.filter(t => t.date === date && t.time).sort((a, b) => a.time!.localeCompare(b.time!))
  }, [tasks])

  // Calculate task position and height for timeline
  const getTaskStyle = (task: Task) => {
    if (!task.time) return {}
    const [hours, minutes] = task.time.split(':').map(Number)
    const startMinutes = (hours - 6) * 60 + minutes
    const height = Math.max((task.duration / 60) * 64, 32) // 64px per hour, min 32px
    return {
      top: `${(startMinutes / 60) * 64}px`,
      height: `${height}px`,
    }
  }

  const miniCalDays = useMemo(() => getMonthDays(miniCalYear, miniCalMonth), [miniCalYear, miniCalMonth])

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Weekly Planner</h1>
            <p className="text-text-secondary mt-1">
              {weekDays[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Mini Calendar Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowMiniCalendar(!showMiniCalendar)}
                className={`px-4 py-2 rounded-xl border-2 transition-all flex items-center gap-2 ${
                  showMiniCalendar
                    ? 'bg-accent-green/20 border-accent-green text-accent-green'
                    : 'border-border-default text-text-secondary hover:border-accent-green/50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium">Calendar</span>
              </button>

              {/* Mini Calendar Dropdown */}
              {showMiniCalendar && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMiniCalendar(false)} />
                  <div className="absolute right-0 top-12 z-50 bg-bg-card border border-border-default rounded-2xl shadow-xl p-4 w-72">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() => {
                          if (miniCalMonth === 0) {
                            setMiniCalMonth(11)
                            setMiniCalYear(miniCalYear - 1)
                          } else {
                            setMiniCalMonth(miniCalMonth - 1)
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="font-semibold text-text-primary">
                        {monthNames[miniCalMonth]} {miniCalYear}
                      </span>
                      <button
                        onClick={() => {
                          if (miniCalMonth === 11) {
                            setMiniCalMonth(0)
                            setMiniCalYear(miniCalYear + 1)
                          } else {
                            setMiniCalMonth(miniCalMonth + 1)
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {dayNamesShort.map((d, i) => (
                        <div key={i} className="text-center text-xs font-medium text-text-muted py-1">
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {miniCalDays.map((date, i) => {
                        if (!date) return <div key={i} />
                        const dateStr = formatDate(date)
                        const isToday = dateStr === today
                        const isSelected = dateStr === selectedDate
                        const hasTasks = tasks.some(t => t.date === dateStr)

                        return (
                          <button
                            key={i}
                            onClick={() => selectDateFromCalendar(date)}
                            className={`relative aspect-square rounded-lg text-sm font-medium transition-all ${
                              isSelected
                                ? 'bg-accent-green text-white'
                                : isToday
                                ? 'bg-accent-green/20 text-accent-green'
                                : 'text-text-secondary hover:bg-bg-elevated'
                            }`}
                          >
                            {date.getDate()}
                            {hasTasks && !isSelected && (
                              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent-green" />
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-4 pt-4 border-t border-border-default">
                      <Button size="sm" onClick={goToThisWeek} className="w-full">
                        Go to Today
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Week Navigation */}
            <div className="flex items-center gap-1 bg-bg-card rounded-xl border border-border-default p-1">
              <button
                onClick={goToPrevWeek}
                className="p-2 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={goToThisWeek}
                className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-accent-green transition-colors"
              >
                Today
              </button>
              <button
                onClick={goToNextWeek}
                className="p-2 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* AI Quick Add */}
      <Card className="mb-6 overflow-hidden border-2 border-border-default hover:border-accent-green/30 transition-colors">
        <div className="bg-gradient-to-r from-accent-green/10 to-transparent px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-green/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-text-primary">AI Quick Add</span>
            <span className="text-xs text-text-muted hidden sm:inline">Type naturally, like &quot;Math homework tomorrow at 3pm&quot;</span>
          </div>
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAIParse()}
              placeholder="Study for science test next Monday from 2pm for 2 hours..."
              className="flex-1 bg-bg-elevated/50 border-2 border-border-default rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-green transition-colors"
            />
            <Button onClick={handleAIParse} loading={aiLoading} className="px-6">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Button>
          </div>

          {/* AI Preview */}
          {aiPreview && (
            <div className="mt-4 p-4 bg-bg-secondary rounded-xl border border-accent-green/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-accent-green">Preview</span>
                <span className="text-xs text-text-muted">{Math.round(aiPreview.confidence * 100)}% confidence</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-text-muted text-xs">Title</p>
                  <p className="text-text-primary font-medium truncate">{aiPreview.title}</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Date</p>
                  <p className="text-text-primary font-medium">{aiPreview.date}</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Time</p>
                  <p className="text-text-primary font-medium">{aiPreview.time ? formatTime12(aiPreview.time) : 'Not set'}</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Duration</p>
                  <p className="text-text-primary font-medium">{aiPreview.duration}m</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={handleAddTask} className="flex-1">Confirm & Add</Button>
                <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}>Edit</Button>
                <Button variant="secondary" size="sm" onClick={() => { setAiPreview(null); setAiInput('') }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Weekly Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent-green/20 flex items-center justify-center">
              <span className="text-xl font-bold text-accent-green">{weekStats.total}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Total Tasks</p>
              <p className="text-xs text-text-muted">This week</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent-blue/20 flex items-center justify-center relative">
              <svg className="w-12 h-12 -rotate-90">
                <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="4" className="text-bg-elevated" />
                <circle
                  cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="4"
                  className="text-accent-blue"
                  strokeDasharray={`${(weekStats.completed / Math.max(weekStats.total, 1)) * 113} 113`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-sm font-bold text-accent-blue">
                {weekStats.total > 0 ? Math.round((weekStats.completed / weekStats.total) * 100) : 0}%
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Completed</p>
              <p className="text-xs text-text-muted">{weekStats.completed} of {weekStats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent-purple/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{Math.round(weekStats.totalMinutes / 60)}h Planned</p>
              <p className="text-xs text-text-muted">{Math.round(weekStats.completedMinutes / 60)}h done</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <span className="text-xl font-bold text-amber-500">{weekStats.total - weekStats.completed}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Remaining</p>
              <p className="text-xs text-text-muted">To complete</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Visual Week Schedule */}
      <Card className="overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-8 border-b border-border-default bg-bg-secondary">
          <div className="p-3 text-center">
            <span className="text-xs font-medium text-text-muted">TIME</span>
          </div>
          {weekDays.map((day, index) => {
            const dateStr = formatDate(day)
            const isToday = dateStr === today
            const dayTasks = getTasksForDay(dateStr)
            const completedCount = dayTasks.filter(t => t.completed).length

            return (
              <div
                key={dateStr}
                className={`p-3 text-center border-l border-border-default transition-colors ${
                  isToday ? 'bg-accent-green/10' : ''
                }`}
              >
                <p className={`text-xs font-medium ${isToday ? 'text-accent-green' : 'text-text-muted'}`}>
                  {dayNames[index]}
                </p>
                <p className={`text-lg font-bold ${isToday ? 'text-accent-green' : 'text-text-primary'}`}>
                  {day.getDate()}
                </p>
                {dayTasks.length > 0 && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className={`text-xs ${completedCount === dayTasks.length ? 'text-accent-green' : 'text-text-muted'}`}>
                      {completedCount}/{dayTasks.length}
                    </span>
                    {completedCount === dayTasks.length && dayTasks.length > 0 && (
                      <svg className="w-3 h-3 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Time Grid */}
        <div className="relative">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-green"></div>
            </div>
          ) : (
            <div className="grid grid-cols-8" style={{ height: `${17 * 64}px` }}>
              {/* Time Labels Column */}
              <div className="relative border-r border-border-default">
                {timeSlots.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full text-right pr-3 text-xs text-text-muted"
                    style={{ top: `${(hour - 6) * 64}px`, height: '64px' }}
                  >
                    <span className="relative -top-2">
                      {hour === 0 ? '12AM' : hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {weekDays.map((day, dayIndex) => {
                const dateStr = formatDate(day)
                const isToday = dateStr === today
                const dayTasks = getTimelineTasks(dateStr)

                return (
                  <div
                    key={dateStr}
                    className={`relative border-l border-border-default ${isToday ? 'bg-accent-green/5' : ''}`}
                  >
                    {/* Hour grid lines */}
                    {timeSlots.map((hour) => (
                      <div
                        key={hour}
                        onClick={() => openAddModal(dateStr, `${hour.toString().padStart(2, '0')}:00`)}
                        className="absolute w-full border-t border-border-default/50 hover:bg-accent-green/10 cursor-pointer transition-colors"
                        style={{ top: `${(hour - 6) * 64}px`, height: '64px' }}
                      />
                    ))}

                    {/* Current time indicator */}
                    {isToday && currentHour >= 6 && currentHour < 23 && (
                      <div
                        className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                        style={{ top: `${((currentHour - 6) * 60 + currentMinute) * (64 / 60)}px` }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-error -ml-1" />
                        <div className="flex-1 h-0.5 bg-error" />
                      </div>
                    )}

                    {/* Task blocks */}
                    {dayTasks.map((task) => {
                      const subject = getSubject(task.subject)
                      const style = getTaskStyle(task)

                      return (
                        <div
                          key={task.id}
                          className={`absolute left-1 right-1 rounded-lg border-l-4 overflow-hidden cursor-pointer transition-all hover:shadow-lg group ${
                            task.completed ? 'opacity-60' : ''
                          } ${subject.borderColor} ${subject.lightColor}`}
                          style={style}
                          onClick={() => setSelectedDate(dateStr)}
                        >
                          <div className="p-2 h-full flex flex-col">
                            <div className="flex items-start justify-between gap-1">
                              <p className={`text-xs font-medium truncate ${task.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                                {task.title}
                              </p>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleTask(task.id, task.completed) }}
                                className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                  task.completed
                                    ? 'bg-accent-green border-accent-green'
                                    : 'border-border-default hover:border-accent-green'
                                }`}
                              >
                                {task.completed && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            </div>
                            <p className={`text-[10px] mt-auto ${subject.textColor}`}>
                              {formatTime12(task.time!)} · {task.duration}m
                            </p>
                          </div>
                          {/* Delete button on hover */}
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }}
                            className="absolute top-1 right-6 opacity-0 group-hover:opacity-100 p-0.5 rounded bg-error/20 text-error hover:bg-error/30 transition-all"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )
                    })}

                    {/* Unscheduled tasks indicator */}
                    {getTasksForDay(dateStr).filter(t => !t.time).length > 0 && (
                      <div className="absolute bottom-2 left-1 right-1">
                        <div className="bg-bg-secondary rounded-lg p-2 border border-border-default">
                          <p className="text-[10px] text-text-muted mb-1">
                            {getTasksForDay(dateStr).filter(t => !t.time).length} unscheduled
                          </p>
                          {getTasksForDay(dateStr).filter(t => !t.time).slice(0, 2).map(task => (
                            <div key={task.id} className="flex items-center gap-1.5 py-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${getSubject(task.subject).color}`} />
                              <span className={`text-[10px] truncate ${task.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                                {task.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Subject Legend */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        {subjects.map(s => (
          <div key={s.value} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${s.color}`} />
            <span className="text-xs text-text-muted">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddModal(false)} />
          <Card className="relative z-10 w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-accent-green/10 to-transparent px-6 py-4 border-b border-border-default">
              <h3 className="text-lg font-semibold text-text-primary">Add Task</h3>
              <p className="text-sm text-text-muted">
                {newTask.date ? new Date(newTask.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Task Name</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="What do you need to do?"
                  className="w-full bg-bg-elevated/50 border-2 border-border-default rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-green transition-colors"
                  autoFocus
                />
              </div>

              {/* Date & Time Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Date</label>
                  <input
                    type="date"
                    value={newTask.date}
                    onChange={(e) => setNewTask({ ...newTask, date: e.target.value })}
                    className="w-full bg-bg-elevated/50 border-2 border-border-default rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-accent-green transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Time</label>
                  <input
                    type="time"
                    value={newTask.time}
                    onChange={(e) => setNewTask({ ...newTask, time: e.target.value })}
                    className="w-full bg-bg-elevated/50 border-2 border-border-default rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-accent-green transition-colors"
                  />
                </div>
              </div>

              {/* Duration & Subject Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Duration</label>
                  <div className="flex gap-1">
                    {[30, 60, 90, 120].map((d) => (
                      <button
                        key={d}
                        onClick={() => setNewTask({ ...newTask, duration: d })}
                        className={`flex-1 py-2 text-xs font-medium rounded-lg border-2 transition-colors ${
                          newTask.duration === d
                            ? 'bg-accent-green/20 border-accent-green text-accent-green'
                            : 'border-border-default text-text-muted hover:border-accent-green/50'
                        }`}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Subject</label>
                  <select
                    value={newTask.subject}
                    onChange={(e) => setNewTask({ ...newTask, subject: e.target.value })}
                    className="w-full bg-bg-elevated/50 border-2 border-border-default rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-green transition-colors"
                  >
                    {subjects.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => { setShowAddModal(false); setAiPreview(null) }} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleAddTask} disabled={!newTask.title.trim() || !newTask.date} className="flex-1">
                  Add Task
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
