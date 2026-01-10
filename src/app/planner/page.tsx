'use client'

import { useState, useEffect } from 'react'
import { Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

interface Task {
  id: string
  title: string
  description?: string
  date: string
  time?: string
  subject?: string
  completed: boolean
  created_at: string
}

const subjects = [
  { value: 'math', label: 'Math', color: 'bg-green-500' },
  { value: 'science', label: 'Science', color: 'bg-blue-500' },
  { value: 'ela', label: 'English', color: 'bg-purple-500' },
  { value: 'social-studies', label: 'Social Studies', color: 'bg-orange-500' },
  { value: 'general', label: 'General', color: 'bg-gray-500' },
]

const getSubjectColor = (subject?: string) => {
  const found = subjects.find(s => s.value === subject)
  return found?.color || 'bg-gray-500'
}

const getSubjectLabel = (subject?: string) => {
  const found = subjects.find(s => s.value === subject)
  return found?.label || 'General'
}

// Get the start of the week (Monday)
const getWeekStart = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Format date as YYYY-MM-DD
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

// Format date for display
const formatDisplayDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Get array of 7 days starting from a date
const getWeekDays = (startDate: Date): Date[] => {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    days.push(day)
  }
  return days
}

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [addingToDay, setAddingToDay] = useState<string | null>(null)
  const [newTask, setNewTask] = useState({ title: '', subject: 'general', time: '' })
  const supabase = createClient()

  const weekDays = getWeekDays(weekStart)
  const today = formatDate(new Date())

  // Fetch tasks for the week
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
          setTasks(data)
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [weekStart, supabase])

  // Navigate weeks
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
  }

  // Add task
  const handleAddTask = async (date: string) => {
    if (!newTask.title.trim()) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data, error } = await supabase
        .from('planner_tasks')
        .insert({
          user_id: session.user.id,
          title: newTask.title.trim(),
          date,
          time: newTask.time || null,
          subject: newTask.subject,
          completed: false,
        })
        .select()
        .single()

      if (!error && data) {
        setTasks(prev => [...prev, data])
      }
    } catch {
      // Silently fail
    }

    setNewTask({ title: '', subject: 'general', time: '' })
    setAddingToDay(null)
  }

  // Toggle task completion
  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from('planner_tasks')
        .update({ completed: !completed })
        .eq('id', taskId)

      if (!error) {
        setTasks(prev =>
          prev.map(t => (t.id === taskId ? { ...t, completed: !completed } : t))
        )
      }
    } catch {
      // Silently fail
    }
  }

  // Delete task
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

  // Get tasks for a specific day
  const getTasksForDay = (date: string): Task[] => {
    return tasks.filter(t => t.date === date).sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    })
  }

  const weekEndDate = new Date(weekStart)
  weekEndDate.setDate(weekEndDate.getDate() + 6)

  return (
    <div className="min-h-screen bg-bg-primary p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Weekly Planner</h1>
            <p className="text-text-muted text-sm mt-1">
              {formatDisplayDate(weekStart)} - {formatDisplayDate(weekEndDate)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={goToPrevWeek}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <Button variant="secondary" size="sm" onClick={goToThisWeek}>
              Today
            </Button>
            <Button variant="secondary" size="sm" onClick={goToNextWeek}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {weekDays.map((day, index) => {
            const dateStr = formatDate(day)
            const isToday = dateStr === today
            const dayTasks = getTasksForDay(dateStr)
            const isAddingHere = addingToDay === dateStr

            return (
              <Card
                key={dateStr}
                className={`min-h-[200px] flex flex-col ${
                  isToday ? 'ring-2 ring-accent-green border-accent-green/50' : ''
                }`}
              >
                {/* Day Header */}
                <div className={`flex items-center justify-between pb-3 border-b border-border-default mb-3 ${
                  isToday ? 'text-accent-green' : 'text-text-primary'
                }`}>
                  <div>
                    <p className="font-semibold">{dayNames[index]}</p>
                    <p className={`text-xs ${isToday ? 'text-accent-green' : 'text-text-muted'}`}>
                      {formatDisplayDate(day)}
                    </p>
                  </div>
                  {isToday && (
                    <span className="text-[10px] font-medium bg-accent-green text-white px-1.5 py-0.5 rounded">
                      TODAY
                    </span>
                  )}
                </div>

                {/* Tasks */}
                <div className="flex-1 space-y-2">
                  {loading ? (
                    <p className="text-text-muted text-xs text-center py-4">Loading...</p>
                  ) : dayTasks.length === 0 && !isAddingHere ? (
                    <p className="text-text-muted text-xs text-center py-4">No tasks</p>
                  ) : (
                    dayTasks.map(task => (
                      <div
                        key={task.id}
                        className={`group flex items-start gap-2 p-2 rounded-lg border transition-all ${
                          task.completed
                            ? 'bg-bg-secondary/50 border-border-default'
                            : 'bg-bg-card border-border-default hover:border-accent-green/30'
                        }`}
                      >
                        <button
                          onClick={() => toggleTask(task.id, task.completed)}
                          className={`w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
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
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-tight ${
                            task.completed ? 'text-text-muted line-through' : 'text-text-primary'
                          }`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {task.time && (
                              <span className="text-[10px] text-text-muted">{task.time}</span>
                            )}
                            <span className={`w-1.5 h-1.5 rounded-full ${getSubjectColor(task.subject)}`} />
                          </div>
                        </div>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}

                  {/* Add Task Form */}
                  {isAddingHere && (
                    <div className="space-y-2 p-2 bg-bg-secondary rounded-lg border border-accent-green/30">
                      <input
                        type="text"
                        placeholder="Task name..."
                        value={newTask.title}
                        onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleAddTask(dateStr)}
                        className="w-full text-xs px-2 py-1.5 rounded bg-bg-card border border-border-default focus:border-accent-green focus:outline-none text-text-primary"
                        autoFocus
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="time"
                          value={newTask.time}
                          onChange={e => setNewTask(prev => ({ ...prev, time: e.target.value }))}
                          className="flex-1 text-xs px-2 py-1 rounded bg-bg-card border border-border-default focus:border-accent-green focus:outline-none text-text-primary"
                        />
                        <select
                          value={newTask.subject}
                          onChange={e => setNewTask(prev => ({ ...prev, subject: e.target.value }))}
                          className="flex-1 text-xs px-2 py-1 rounded bg-bg-card border border-border-default focus:border-accent-green focus:outline-none text-text-primary"
                        >
                          {subjects.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleAddTask(dateStr)}
                          className="flex-1 text-xs py-1"
                        >
                          Add
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setAddingToDay(null)
                            setNewTask({ title: '', subject: 'general', time: '' })
                          }}
                          className="text-xs py-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Add Button */}
                {!isAddingHere && (
                  <button
                    onClick={() => setAddingToDay(dateStr)}
                    className="mt-2 w-full py-1.5 text-xs text-text-muted hover:text-accent-green hover:bg-accent-green/10 rounded-lg border border-dashed border-border-default hover:border-accent-green/50 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add
                  </button>
                )}
              </Card>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {subjects.map(s => (
            <div key={s.value} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              <span className="text-xs text-text-muted">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3 max-w-md mx-auto">
          <Card className="text-center py-3">
            <p className="text-2xl font-bold text-text-primary">{tasks.length}</p>
            <p className="text-xs text-text-muted">Total Tasks</p>
          </Card>
          <Card className="text-center py-3">
            <p className="text-2xl font-bold text-accent-green">{tasks.filter(t => t.completed).length}</p>
            <p className="text-xs text-text-muted">Completed</p>
          </Card>
          <Card className="text-center py-3">
            <p className="text-2xl font-bold text-amber-500">{tasks.filter(t => !t.completed).length}</p>
            <p className="text-xs text-text-muted">Remaining</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
