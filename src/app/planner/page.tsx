'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { generateAIResponse } from '@/lib/ai-client'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'

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
  { value: 'math', label: 'Math', color: 'bg-accent-green', textColor: 'text-accent-green' },
  { value: 'science', label: 'Science', color: 'bg-accent-blue', textColor: 'text-accent-blue' },
  { value: 'ela', label: 'English', color: 'bg-accent-purple', textColor: 'text-accent-purple' },
  { value: 'social-studies', label: 'Social Studies', color: 'bg-amber-500', textColor: 'text-amber-500' },
  { value: 'general', label: 'General', color: 'bg-text-muted', textColor: 'text-text-muted' },
]

const getSubjectColor = (subject?: string) => {
  const found = subjects.find(s => s.value === subject)
  return found?.color || 'bg-text-muted'
}

const getSubjectTextColor = (subject?: string) => {
  const found = subjects.find(s => s.value === subject)
  return found?.textColor || 'text-text-muted'
}

const getSubjectLabel = (subject?: string) => {
  const found = subjects.find(s => s.value === subject)
  return found?.label || 'General'
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

const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

const formatDisplayDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatFullDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const getWeekDays = (startDate: Date): Date[] => {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    days.push(day)
  }
  return days
}

const formatTime12 = (time24: string): string => {
  const [hours, minutes] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
}

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const fullDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Hours for timeline (6 AM to 11 PM)
const timelineHours = Array.from({ length: 18 }, (_, i) => i + 6)

// Draggable Task Card Component
function DraggableTaskCard({ task, onToggle, onDelete, compact = false }: {
  task: Task
  onToggle: (id: string, completed: boolean) => void
  onDelete: (id: string) => void
  compact?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  })

  const style = transform ? {
    transform: `translate(${transform.x}px, ${transform.y}px)`,
    zIndex: 1000,
  } : undefined

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`group flex items-center gap-2 p-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
          isDragging ? 'opacity-50' : ''
        } ${
          task.completed
            ? 'bg-bg-secondary/50 border-border-default'
            : 'bg-bg-card border-border-default hover:border-accent-green/30'
        }`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(task.id, task.completed) }}
          className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
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
          <p className={`text-xs leading-tight truncate ${
            task.completed ? 'text-text-muted line-through' : 'text-text-primary'
          }`}>
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {task.time && <span className="text-[10px] text-text-muted">{formatTime12(task.time)}</span>}
            <span className={`w-1.5 h-1.5 rounded-full ${getSubjectColor(task.subject)}`} />
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all p-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // Full timeline card
  const durationHeight = Math.max(task.duration / 60 * 60, 40) // min 40px

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, height: durationHeight }}
      {...listeners}
      {...attributes}
      className={`group absolute left-16 right-2 rounded-lg border-l-4 p-2 cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'opacity-50 shadow-xl' : 'hover:shadow-lg'
      } ${getSubjectColor(task.subject).replace('bg-', 'border-')} ${
        task.completed ? 'bg-bg-secondary/80' : 'bg-bg-card'
      }`}
    >
      <div className="flex items-start justify-between h-full">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            task.completed ? 'text-text-muted line-through' : 'text-text-primary'
          }`}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs ${getSubjectTextColor(task.subject)}`}>
              {getSubjectLabel(task.subject)}
            </span>
            <span className="text-xs text-text-muted">
              {task.duration}m
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(task.id, task.completed) }}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              task.completed
                ? 'bg-accent-green border-accent-green'
                : 'border-border-default hover:border-accent-green'
            }`}
          >
            {task.completed && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// Droppable Time Slot Component
function DroppableTimeSlot({ hour, date, onClick }: {
  hour: number
  date: string
  onClick: (hour: number) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${date}-${hour}`,
    data: { hour, date },
  })

  return (
    <div
      ref={setNodeRef}
      onClick={() => onClick(hour)}
      className={`h-[60px] border-t border-border-default/50 cursor-pointer transition-colors ${
        isOver ? 'bg-accent-green/10' : 'hover:bg-bg-elevated/50'
      }`}
    />
  )
}

// Droppable Day Card Component
function DroppableDayCard({ date, children }: {
  date: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${date}`,
    data: { date },
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 space-y-2 min-h-[100px] transition-colors rounded-lg ${
        isOver ? 'bg-accent-green/5' : ''
      }`}
    >
      {children}
    </div>
  )
}

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'week' | 'day'>('week')
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()))
  const [showAddModal, setShowAddModal] = useState(false)
  const [addModalDate, setAddModalDate] = useState<string>('')
  const [addModalTime, setAddModalTime] = useState<string>('')
  const [activeTask, setActiveTask] = useState<Task | null>(null)

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
  const weekDays = getWeekDays(weekStart)
  const today = formatDate(new Date())

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

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
          // Add default duration if missing
          const tasksWithDuration = data.map(t => ({
            ...t,
            duration: t.duration || 60,
          }))
          setTasks(tasksWithDuration)
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

  // Navigate days in day view
  const goToPrevDay = () => {
    const current = new Date(selectedDate)
    current.setDate(current.getDate() - 1)
    setSelectedDate(formatDate(current))
    // Update week if needed
    if (current < weekStart) {
      setWeekStart(getWeekStart(current))
    }
  }

  const goToNextDay = () => {
    const current = new Date(selectedDate)
    current.setDate(current.getDate() + 1)
    setSelectedDate(formatDate(current))
    // Update week if needed
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    if (current > weekEnd) {
      setWeekStart(getWeekStart(current))
    }
  }

  const goToToday = () => {
    setSelectedDate(formatDate(new Date()))
    setWeekStart(getWeekStart(new Date()))
  }

  // Open day view
  const openDayView = (dateStr: string) => {
    setSelectedDate(dateStr)
    setView('day')
  }

  // Add task
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

  // Update task (for drag and drop)
  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      const { error } = await supabase
        .from('planner_tasks')
        .update(updates)
        .eq('id', taskId)

      if (!error) {
        setTasks(prev =>
          prev.map(t => (t.id === taskId ? { ...t, ...updates } : t))
        )
      }
    } catch {
      // Silently fail
    }
  }

  // Get tasks for a specific day
  const getTasksForDay = useCallback((date: string): Task[] => {
    return tasks.filter(t => t.date === date).sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    })
  }, [tasks])

  // AI Parse task
  const handleAIParse = async () => {
    if (!aiInput.trim()) return

    setAiLoading(true)
    try {
      const response = await generateAIResponse({
        feature: 'planner',
        input: aiInput,
      })

      // Parse the JSON response
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

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task
    setActiveTask(task)
  }

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null)

    const { active, over } = event
    if (!over || !active.data.current) return

    const task = active.data.current.task as Task
    const overData = over.data.current

    if (overData?.date && overData?.hour !== undefined) {
      // Dropped on a time slot
      const newTime = `${overData.hour.toString().padStart(2, '0')}:00`
      updateTask(task.id, { date: overData.date, time: newTime })
    } else if (overData?.date) {
      // Dropped on a day card (week view)
      updateTask(task.id, { date: overData.date })
    }
  }

  // Open add modal with pre-filled data
  const openAddModal = (date: string, time?: string) => {
    setAddModalDate(date)
    setAddModalTime(time || '')
    setNewTask({
      title: '',
      subject: 'general',
      time: time || '',
      duration: 60,
      date: date,
    })
    setShowAddModal(true)
  }

  const weekEndDate = new Date(weekStart)
  weekEndDate.setDate(weekEndDate.getDate() + 6)

  // Get current time position for indicator
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const timeIndicatorTop = (currentHour - 6) * 60 + currentMinute

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">Weekly Planner</h1>
              <p className="text-text-secondary mt-1">
                {view === 'week'
                  ? `${formatDisplayDate(weekStart)} - ${formatDisplayDate(weekEndDate)}`
                  : formatFullDate(new Date(selectedDate))
                }
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex bg-bg-card rounded-xl border border-border-default p-1">
                <button
                  onClick={() => setView('week')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    view === 'week'
                      ? 'bg-accent-green text-white'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setView('day')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    view === 'day'
                      ? 'bg-accent-green text-white'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Day
                </button>
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" onClick={view === 'week' ? goToPrevWeek : goToPrevDay}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Button>
                <Button variant="secondary" size="sm" onClick={view === 'week' ? goToThisWeek : goToToday}>
                  Today
                </Button>
                <Button variant="secondary" size="sm" onClick={view === 'week' ? goToNextWeek : goToNextDay}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Input Bar */}
        <Card className="mb-6 overflow-hidden border-2 border-border-default hover:border-accent-green/30 transition-colors">
          <div className="bg-gradient-to-r from-accent-green/10 to-transparent px-4 py-3 border-b border-border-default">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-green/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-text-primary">AI Quick Add</span>
              <span className="text-xs text-text-muted">Type naturally, like &quot;Math homework tomorrow at 3pm&quot;</span>
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
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add
              </Button>
            </div>

            {/* AI Preview */}
            {aiPreview && (
              <div className="mt-4 p-4 bg-bg-secondary rounded-xl border border-accent-green/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-accent-green">Preview</span>
                  <span className="text-xs text-text-muted">
                    {Math.round(aiPreview.confidence * 100)}% confidence
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-text-muted text-xs">Title</p>
                    <p className="text-text-primary font-medium">{aiPreview.title}</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Date</p>
                    <p className="text-text-primary font-medium">{aiPreview.date}</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Time</p>
                    <p className="text-text-primary font-medium">
                      {aiPreview.time ? formatTime12(aiPreview.time) : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Duration</p>
                    <p className="text-text-primary font-medium">{aiPreview.duration}m</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={handleAddTask} className="flex-1">
                    Confirm & Add
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddModal(true)
                      setAddModalDate(aiPreview.date)
                      setAddModalTime(aiPreview.time || '')
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setAiPreview(null)
                      setAiInput('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Week View */}
        {view === 'week' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {weekDays.map((day, index) => {
              const dateStr = formatDate(day)
              const isToday = dateStr === today
              const dayTasks = getTasksForDay(dateStr)

              return (
                <Card
                  key={dateStr}
                  className={`min-h-[240px] flex flex-col cursor-pointer transition-all hover:border-accent-green/30 ${
                    isToday ? 'ring-2 ring-accent-green border-accent-green/50' : ''
                  }`}
                  onClick={() => openDayView(dateStr)}
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
                  <DroppableDayCard date={dateStr}>
                    {loading ? (
                      <p className="text-text-muted text-xs text-center py-4">Loading...</p>
                    ) : dayTasks.length === 0 ? (
                      <p className="text-text-muted text-xs text-center py-4">No tasks</p>
                    ) : (
                      <>
                        {dayTasks.slice(0, 4).map(task => (
                          <DraggableTaskCard
                            key={task.id}
                            task={task}
                            onToggle={toggleTask}
                            onDelete={deleteTask}
                            compact
                          />
                        ))}
                        {dayTasks.length > 4 && (
                          <p className="text-xs text-text-muted text-center py-1">
                            +{dayTasks.length - 4} more
                          </p>
                        )}
                      </>
                    )}
                  </DroppableDayCard>

                  {/* Add Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openAddModal(dateStr)
                    }}
                    className="mt-auto pt-2 w-full py-1.5 text-xs text-text-muted hover:text-accent-green hover:bg-accent-green/10 rounded-lg border border-dashed border-border-default hover:border-accent-green/50 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add
                  </button>
                </Card>
              )
            })}
          </div>
        )}

        {/* Day View */}
        {view === 'day' && (
          <Card className="overflow-hidden">
            {/* Day Header */}
            <div className="bg-gradient-to-r from-accent-green/10 to-transparent px-6 py-4 border-b border-border-default">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-accent-green/20 flex items-center justify-center">
                    <span className="text-accent-green font-bold text-lg">
                      {new Date(selectedDate).getDate()}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      {fullDayNames[new Date(selectedDate).getDay() === 0 ? 6 : new Date(selectedDate).getDay() - 1]}
                    </h2>
                    <p className="text-sm text-text-muted">
                      {new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <Button onClick={() => setView('week')} variant="secondary" size="sm">
                  Back to Week
                </Button>
              </div>
            </div>

            {/* Timeline */}
            <div className="relative" style={{ height: `${18 * 60}px` }}>
              {/* Current time indicator */}
              {selectedDate === today && currentHour >= 6 && currentHour < 24 && (
                <div
                  className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                  style={{ top: timeIndicatorTop }}
                >
                  <div className="w-3 h-3 rounded-full bg-error" />
                  <div className="flex-1 h-0.5 bg-error" />
                </div>
              )}

              {/* Hour rows */}
              {timelineHours.map((hour) => {
                const hourTasks = getTasksForDay(selectedDate).filter(t => {
                  if (!t.time) return false
                  const taskHour = parseInt(t.time.split(':')[0])
                  return taskHour === hour
                })

                return (
                  <div key={hour} className="relative">
                    {/* Hour label */}
                    <div
                      className="absolute left-0 w-14 text-right pr-3 text-xs text-text-muted"
                      style={{ top: (hour - 6) * 60 + 2 }}
                    >
                      {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                    </div>

                    {/* Droppable time slot */}
                    <div
                      className="absolute left-14 right-0"
                      style={{ top: (hour - 6) * 60 }}
                    >
                      <DroppableTimeSlot
                        hour={hour}
                        date={selectedDate}
                        onClick={(h) => openAddModal(selectedDate, `${h.toString().padStart(2, '0')}:00`)}
                      />
                    </div>

                    {/* Tasks at this hour */}
                    {hourTasks.map(task => {
                      const taskMinute = parseInt(task.time!.split(':')[1])
                      const topOffset = (hour - 6) * 60 + taskMinute

                      return (
                        <div key={task.id} style={{ position: 'absolute', top: topOffset, left: 0, right: 0 }}>
                          <DraggableTaskCard
                            task={task}
                            onToggle={toggleTask}
                            onDelete={deleteTask}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Tasks without time */}
              {getTasksForDay(selectedDate).filter(t => !t.time).length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 bg-bg-secondary border-t border-border-default p-4">
                  <p className="text-xs text-text-muted mb-2">Unscheduled Tasks</p>
                  <div className="space-y-2">
                    {getTasksForDay(selectedDate).filter(t => !t.time).map(task => (
                      <DraggableTaskCard
                        key={task.id}
                        task={task}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

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

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          {subjects.map(s => (
            <div key={s.value} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              <span className="text-xs text-text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeTask && (
          <div className="bg-bg-card border border-accent-green rounded-lg p-3 shadow-xl opacity-90">
            <p className="text-sm font-medium text-text-primary">{activeTask.title}</p>
            <div className="flex items-center gap-2 mt-1">
              {activeTask.time && <span className="text-xs text-text-muted">{formatTime12(activeTask.time)}</span>}
              <span className={`w-2 h-2 rounded-full ${getSubjectColor(activeTask.subject)}`} />
            </div>
          </div>
        )}
      </DragOverlay>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddModal(false)} />
          <Card className="relative z-10 w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-accent-green/10 to-transparent px-6 py-4 border-b border-border-default">
              <h3 className="text-lg font-semibold text-text-primary">Add Task</h3>
              <p className="text-sm text-text-muted">
                {newTask.date ? formatFullDate(new Date(newTask.date)) : 'Select a date'}
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
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddModal(false)
                    setAiPreview(null)
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddTask}
                  disabled={!newTask.title.trim() || !newTask.date}
                  className="flex-1"
                >
                  Add Task
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </DndContext>
  )
}
