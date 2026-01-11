'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  DragOverEvent,
  closestCenter,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

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

interface RecentTemplate {
  id: string
  title: string
  duration: number
  subject: string
  useCount: number
}

const subjects = [
  { value: 'math', label: 'Math', color: 'bg-emerald-500', lightBg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' },
  { value: 'science', label: 'Science', color: 'bg-blue-500', lightBg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' },
  { value: 'ela', label: 'English', color: 'bg-purple-500', lightBg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/30' },
  { value: 'social-studies', label: 'History', color: 'bg-amber-500', lightBg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30' },
  { value: 'general', label: 'General', color: 'bg-slate-500', lightBg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
]

const getSubjectStyle = (subject?: string) => subjects.find(s => s.value === subject) || subjects[4]

// Time utilities
const formatTime12 = (time24: string): string => {
  const [hours, minutes] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  return minutes === 0 ? `${hours12} ${period}` : `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
}

const formatTimeShort = (time24: string): string => {
  const [hours] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'p' : 'a'
  const hours12 = hours % 12 || 12
  return `${hours12}${period}`
}

// Date utilities
const formatDate = (date: Date): string => date.toISOString().split('T')[0]

const getWeekStart = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const getWeekDays = (startDate: Date): Date[] => {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    return day
  })
}

const isToday = (date: Date): boolean => {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Time slots from 6 AM to 10 PM
const timeSlots = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 6
  return {
    hour,
    label: hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`,
    value: `${hour.toString().padStart(2, '0')}:00`
  }
})

// Draggable Task Component
function DraggableTask({ task, isCompact = false, isTemplate = false }: { task: Task | RecentTemplate, isCompact?: boolean, isTemplate?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: isTemplate ? `template-${task.id}` : task.id,
    data: { task, isTemplate }
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  const subjectStyle = getSubjectStyle((task as Task).subject || (task as RecentTemplate).subject)

  if (isCompact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`group px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-all ${subjectStyle.lightBg} ${subjectStyle.border} border hover:scale-[1.02] hover:shadow-md`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${subjectStyle.color}`} />
          <span className="text-sm font-medium text-text-primary truncate flex-1">{task.title}</span>
          {'time' in task && task.time && (
            <span className="text-xs text-text-muted">{formatTimeShort(task.time)}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group p-3 rounded-xl cursor-grab active:cursor-grabbing transition-all ${subjectStyle.lightBg} ${subjectStyle.border} border-2 hover:shadow-lg`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-1 h-full min-h-[40px] rounded-full ${subjectStyle.color}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-1">
            {'time' in task && task.time && (
              <span className={`text-xs ${subjectStyle.text}`}>{formatTime12(task.time)}</span>
            )}
            <span className="text-xs text-text-muted">{task.duration}m</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Droppable Time Slot
function DroppableTimeSlot({ date, hour, children, isOver }: { date: string, hour: number, children?: React.ReactNode, isOver?: boolean }) {
  const timeValue = `${hour.toString().padStart(2, '0')}:00`
  const { setNodeRef, isOver: dropping } = useDroppable({
    id: `${date}-${timeValue}`,
    data: { date, time: timeValue }
  })

  const showDropIndicator = dropping || isOver

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[60px] border-t border-border-default/50 relative transition-all ${
        showDropIndicator ? 'bg-accent-green/10 border-accent-green' : ''
      }`}
    >
      {showDropIndicator && (
        <div className="absolute inset-0 border-2 border-dashed border-accent-green rounded-lg pointer-events-none z-10" />
      )}
      <div className="p-1 space-y-1">
        {children}
      </div>
    </div>
  )
}

// Recent Event Template Card
function RecentEventCard({ template, onDragStart }: { template: RecentTemplate, onDragStart?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `template-${template.id}`,
    data: { template, isTemplate: true }
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  }

  const subjectStyle = getSubjectStyle(template.subject)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group p-3 rounded-xl cursor-grab active:cursor-grabbing transition-all bg-bg-elevated border border-border-default hover:border-accent-green/50 hover:shadow-lg`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${subjectStyle.lightBg} flex items-center justify-center`}>
          <div className={`w-3 h-3 rounded-full ${subjectStyle.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary text-sm truncate">{template.title}</p>
          <p className="text-xs text-text-muted">{template.duration}m · {subjectStyle.label}</p>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default function PlannerPage() {
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  // State
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [tasks, setTasks] = useState<Task[]>([])
  const [recentTemplates, setRecentTemplates] = useState<RecentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()))
  const [showAddModal, setShowAddModal] = useState(false)
  const [showRecentPanel, setShowRecentPanel] = useState(true)
  const [activeTask, setActiveTask] = useState<Task | RecentTemplate | null>(null)
  const [dropTarget, setDropTarget] = useState<{ date: string, time: string } | null>(null)

  // AI input state
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  // New task form
  const [newTask, setNewTask] = useState({
    title: '',
    date: formatDate(new Date()),
    time: '09:00',
    duration: 60,
    subject: 'general',
  })

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )

  // Fetch tasks
  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setLoading(false)
          return
        }

        // Fetch tasks for the week
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

        // Fetch recent/frequent tasks as templates
        const { data: recentData } = await supabase
          .from('planner_tasks')
          .select('title, duration, subject')
          .order('created_at', { ascending: false })
          .limit(50)

        if (recentData) {
          // Group by title and count occurrences
          const templateMap = new Map<string, RecentTemplate>()
          recentData.forEach((t, idx) => {
            const key = t.title.toLowerCase()
            if (templateMap.has(key)) {
              const existing = templateMap.get(key)!
              existing.useCount++
            } else {
              templateMap.set(key, {
                id: `template-${idx}`,
                title: t.title,
                duration: t.duration || 60,
                subject: t.subject || 'general',
                useCount: 1
              })
            }
          })

          // Sort by use count and take top 10
          const templates = Array.from(templateMap.values())
            .sort((a, b) => b.useCount - a.useCount)
            .slice(0, 10)

          setRecentTemplates(templates)
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [weekStart, supabase])

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date()
      const currentHour = now.getHours()
      const scrollPosition = Math.max(0, (currentHour - 6) * 60 - 100)
      scrollRef.current.scrollTop = scrollPosition
    }
  }, [loading])

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

  // Task operations
  const handleAddTask = async () => {
    if (!newTask.title.trim() || !newTask.date || !newTask.time) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data, error } = await supabase
        .from('planner_tasks')
        .insert({
          user_id: session.user.id,
          title: newTask.title.trim(),
          date: newTask.date,
          time: newTask.time,
          duration: newTask.duration,
          subject: newTask.subject,
          completed: false,
        })
        .select()
        .single()

      if (!error && data) {
        setTasks(prev => [...prev, { ...data, duration: data.duration || 60 }])

        // Add to templates if new
        const existingTemplate = recentTemplates.find(t => t.title.toLowerCase() === newTask.title.toLowerCase())
        if (!existingTemplate) {
          setRecentTemplates(prev => [{
            id: `template-new-${Date.now()}`,
            title: newTask.title,
            duration: newTask.duration,
            subject: newTask.subject,
            useCount: 1
          }, ...prev].slice(0, 10))
        }
      }
    } catch {
      // Silently fail
    }

    setNewTask({ title: '', date: formatDate(new Date()), time: '09:00', duration: 60, subject: 'general' })
    setShowAddModal(false)
    setAiInput('')
    setAiError('')
  }

  const updateTaskTime = async (taskId: string, date: string, time: string) => {
    try {
      const { error } = await supabase
        .from('planner_tasks')
        .update({ date, time })
        .eq('id', taskId)

      if (!error) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, date, time } : t
        ))
      }
    } catch {
      // Silently fail
    }
  }

  const createTaskFromTemplate = async (template: RecentTemplate, date: string, time: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data, error } = await supabase
        .from('planner_tasks')
        .insert({
          user_id: session.user.id,
          title: template.title,
          date,
          time,
          duration: template.duration,
          subject: template.subject,
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
  }

  const toggleTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    try {
      const { error } = await supabase
        .from('planner_tasks')
        .update({ completed: !task.completed })
        .eq('id', taskId)

      if (!error) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, completed: !t.completed } : t
        ))
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

  // AI Parse
  const handleAIParse = async () => {
    if (!aiInput.trim()) return

    setAiLoading(true)
    setAiError('')

    try {
      const response = await generateAIResponse({
        feature: 'planner',
        input: aiInput,
      })

      const parsed = JSON.parse(response)

      if (!parsed.title || !parsed.date) {
        throw new Error('Missing required fields')
      }

      setNewTask({
        title: parsed.title,
        date: parsed.date,
        time: parsed.time || '09:00',
        duration: parsed.duration || 60,
        subject: parsed.subject || 'general',
      })
      setShowAddModal(true)
    } catch (err) {
      console.error('AI Parse error:', err)
      setAiError('Could not understand. Try: "Math homework tomorrow at 3pm for 2 hours"')
    } finally {
      setAiLoading(false)
    }
  }

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const data = active.data.current
    if (data?.task) {
      setActiveTask(data.task)
    } else if (data?.template) {
      setActiveTask(data.template)
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (over?.data.current) {
      setDropTarget({
        date: over.data.current.date,
        time: over.data.current.time
      })
    } else {
      setDropTarget(null)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    setDropTarget(null)

    if (!over) return

    const activeData = active.data.current
    const overData = over.data.current

    if (!overData?.date || !overData?.time) return

    if (activeData?.isTemplate && activeData?.template) {
      // Create new task from template
      createTaskFromTemplate(activeData.template, overData.date, overData.time)
    } else if (activeData?.task && !activeData?.isTemplate) {
      // Move existing task
      updateTaskTime(activeData.task.id, overData.date, overData.time)
    }
  }

  // Get tasks for a specific time slot
  const getTasksForSlot = useCallback((date: string, hour: number): Task[] => {
    return tasks.filter(t => {
      if (t.date !== date || !t.time) return false
      const taskHour = parseInt(t.time.split(':')[0])
      return taskHour === hour
    })
  }, [tasks])

  // Week data
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const weekLabel = useMemo(() => {
    const start = weekDays[0]
    const end = weekDays[6]
    if (start.getMonth() === end.getMonth()) {
      return `${monthNames[start.getMonth()]} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`
    }
    return `${monthNames[start.getMonth()]} ${start.getDate()} - ${monthNames[end.getMonth()]} ${end.getDate()}, ${start.getFullYear()}`
  }, [weekDays])

  // Current time indicator
  const now = new Date()
  const currentTimePosition = useMemo(() => {
    const hours = now.getHours()
    const minutes = now.getMinutes()
    if (hours < 6 || hours > 22) return null
    return ((hours - 6) * 60 + minutes)
  }, [now])

  // Stats
  const weekStats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter(t => t.completed).length
    return { total, completed, remaining: total - completed }
  }, [tasks])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Weekly Planner</h1>
              <p className="text-text-muted text-sm mt-1">Drag events to schedule them</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Stats */}
              <div className="hidden sm:flex items-center gap-4 mr-4 px-4 py-2 bg-bg-card rounded-xl border border-border-default">
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{weekStats.total}</p>
                  <p className="text-xs text-text-muted">Total</p>
                </div>
                <div className="w-px h-8 bg-border-default" />
                <div className="text-center">
                  <p className="text-lg font-bold text-accent-green">{weekStats.completed}</p>
                  <p className="text-xs text-text-muted">Done</p>
                </div>
                <div className="w-px h-8 bg-border-default" />
                <div className="text-center">
                  <p className="text-lg font-bold text-amber-500">{weekStats.remaining}</p>
                  <p className="text-xs text-text-muted">Left</p>
                </div>
              </div>

              {/* Toggle Recent Panel */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRecentPanel(!showRecentPanel)}
                className={showRecentPanel ? 'bg-accent-green/20 border-accent-green/50' : ''}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </Button>

              {/* Add Task */}
              <Button size="sm" onClick={() => setShowAddModal(true)}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Task
              </Button>
            </div>
          </div>

          {/* AI Quick Add */}
          <div className="mt-4 flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAIParse()}
                placeholder='Try "Math study session tomorrow at 3pm for 2 hours"'
                className="w-full px-4 py-3 pl-11 bg-bg-card border-2 border-border-default rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-green transition-colors"
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <Button onClick={handleAIParse} loading={aiLoading} className="px-6">
              Schedule
            </Button>
          </div>
          {aiError && <p className="text-error text-sm mt-2">{aiError}</p>}

          {/* Week Navigation */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={goToPrevWeek}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
              <Button variant="ghost" size="sm" onClick={goToThisWeek}>Today</Button>
              <Button variant="ghost" size="sm" onClick={goToNextWeek}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            </div>
            <h2 className="text-lg font-semibold text-text-primary">{weekLabel}</h2>
            <div className="w-[120px]" /> {/* Spacer for alignment */}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Recent Events Panel */}
          {showRecentPanel && (
            <div className="w-64 flex-shrink-0 flex flex-col">
              <Card className="flex-1 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-border-default flex-shrink-0">
                  <h3 className="font-semibold text-text-primary flex items-center gap-2">
                    <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recent Events
                  </h3>
                  <p className="text-xs text-text-muted mt-1">Drag onto calendar to schedule</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {recentTemplates.length === 0 ? (
                    <div className="text-center py-8 text-text-muted text-sm">
                      <p>No recent events</p>
                      <p className="text-xs mt-1">Add tasks to see them here</p>
                    </div>
                  ) : (
                    recentTemplates.map((template) => (
                      <RecentEventCard key={template.id} template={template} />
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Calendar Grid */}
          <div className="flex-1 flex flex-col min-w-0">
            <Card className="flex-1 overflow-hidden flex flex-col">
              {/* Day Headers */}
              <div className="flex-shrink-0 grid grid-cols-[60px_repeat(7,1fr)] border-b border-border-default">
                <div className="p-2" /> {/* Time column spacer */}
                {weekDays.map((day, i) => (
                  <div
                    key={i}
                    className={`p-3 text-center border-l border-border-default/50 ${
                      isToday(day) ? 'bg-accent-green/10' : ''
                    }`}
                  >
                    <p className="text-xs text-text-muted font-medium">{dayNames[i]}</p>
                    <p className={`text-lg font-bold ${isToday(day) ? 'text-accent-green' : 'text-text-primary'}`}>
                      {day.getDate()}
                    </p>
                  </div>
                ))}
              </div>

              {/* Time Grid */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
                {/* Current Time Indicator */}
                {currentTimePosition !== null && isToday(weekDays.find(d => isToday(d)) || new Date()) && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: `${currentTimePosition}px` }}
                  >
                    <div className="flex items-center">
                      <div className="w-[60px] flex justify-end pr-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                      </div>
                      <div className="flex-1 h-0.5 bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Time Rows */}
                {timeSlots.map(({ hour, label, value }) => (
                  <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: '60px' }}>
                    {/* Time Label */}
                    <div className="p-2 text-right pr-3 border-r border-border-default/50">
                      <span className="text-xs text-text-muted font-medium">{label}</span>
                    </div>

                    {/* Day Columns */}
                    {weekDays.map((day, i) => {
                      const dateStr = formatDate(day)
                      const slotTasks = getTasksForSlot(dateStr, hour)
                      const isDropHere = dropTarget?.date === dateStr && dropTarget?.time === value

                      return (
                        <DroppableTimeSlot
                          key={`${dateStr}-${hour}`}
                          date={dateStr}
                          hour={hour}
                          isOver={isDropHere}
                        >
                          {slotTasks.map(task => (
                            <DraggableTask key={task.id} task={task} isCompact />
                          ))}
                        </DroppableTimeSlot>
                      )
                    })}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTask && (
            <div className="opacity-90 shadow-2xl">
              <DraggableTask task={activeTask as Task} />
            </div>
          )}
        </DragOverlay>

        {/* Add Task Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-text-primary">Schedule Task</h2>
                  <button
                    onClick={() => { setShowAddModal(false); setAiError('') }}
                    className="p-2 rounded-lg hover:bg-bg-elevated text-text-muted"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Task Title <span className="text-error">*</span>
                    </label>
                    <input
                      type="text"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="What do you need to do?"
                      className="w-full px-4 py-3 bg-bg-elevated border-2 border-border-default rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-green"
                    />
                  </div>

                  {/* Date & Time Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Date <span className="text-error">*</span>
                      </label>
                      <input
                        type="date"
                        value={newTask.date}
                        onChange={(e) => setNewTask({ ...newTask, date: e.target.value })}
                        className="w-full px-4 py-3 bg-bg-elevated border-2 border-border-default rounded-xl text-text-primary focus:outline-none focus:border-accent-green"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Time <span className="text-error">*</span>
                      </label>
                      <input
                        type="time"
                        value={newTask.time}
                        onChange={(e) => setNewTask({ ...newTask, time: e.target.value })}
                        className="w-full px-4 py-3 bg-bg-elevated border-2 border-border-default rounded-xl text-text-primary focus:outline-none focus:border-accent-green"
                      />
                    </div>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Duration</label>
                    <div className="flex gap-2">
                      {[30, 60, 90, 120].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setNewTask({ ...newTask, duration: d })}
                          className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all ${
                            newTask.duration === d
                              ? 'bg-accent-green text-white'
                              : 'bg-bg-elevated text-text-secondary hover:bg-bg-elevated/80 border border-border-default'
                          }`}
                        >
                          {d}m
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Subject</label>
                    <div className="grid grid-cols-5 gap-2">
                      {subjects.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setNewTask({ ...newTask, subject: s.value })}
                          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                            newTask.subject === s.value
                              ? `${s.color} text-white`
                              : `${s.lightBg} ${s.text} hover:opacity-80`
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <Button
                    variant="secondary"
                    onClick={() => { setShowAddModal(false); setAiError('') }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddTask}
                    disabled={!newTask.title.trim() || !newTask.date || !newTask.time}
                    className="flex-1"
                  >
                    Schedule Task
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DndContext>
  )
}
