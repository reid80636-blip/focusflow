'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
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
function DraggableTask({ task, isCompact = false }: { task: Task, isCompact?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task }
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  const subjectStyle = getSubjectStyle(task.subject)

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
          {task.time && (
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
            {task.time && (
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
      className={`min-h-[80px] border-t border-l border-border-default/50 relative transition-all ${
        showDropIndicator ? 'bg-accent-green/10 border-accent-green' : ''
      }`}
    >
      {showDropIndicator && (
        <div className="absolute inset-0 border-2 border-dashed border-accent-green rounded-lg pointer-events-none z-10" />
      )}
      <div className="p-2 space-y-1">
        {children}
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
  const [loading, setLoading] = useState(true)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [dropTarget, setDropTarget] = useState<{ date: string, time: string } | null>(null)

  // Quick input state
  const [quickInput, setQuickInput] = useState('')

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
  }

  // Quick add task - creates immediately with defaults
  const handleQuickAdd = async () => {
    if (!quickInput.trim()) return

    const now = new Date()
    const currentHour = now.getHours()
    const time = `${currentHour.toString().padStart(2, '0')}:00`

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data, error } = await supabase
        .from('planner_tasks')
        .insert({
          user_id: session.user.id,
          title: quickInput.trim(),
          date: formatDate(now),
          time: time,
          duration: 60,
          subject: 'general',
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

    setQuickInput('')
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

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const data = active.data.current
    if (data?.task) {
      setActiveTask(data.task)
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

    if (activeData?.task) {
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

            </div>
          </div>

          {/* Quick Add */}
          <div className="mt-4 flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                placeholder="What do you need to do?"
                className="w-full px-4 py-3 pl-11 bg-bg-card border-2 border-border-default rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-green transition-colors"
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <Button onClick={handleQuickAdd} className="px-6">
              Add
            </Button>
          </div>

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
        <div className="flex-1 flex overflow-hidden">
          {/* Calendar Grid */}
          <div className="flex-1 flex flex-col">
            <Card className="flex-1 overflow-hidden flex flex-col">
              {/* Day Headers */}
              <div className="flex-shrink-0 grid grid-cols-[80px_repeat(7,1fr)] border-b border-border-default">
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
                {/* Time Rows */}
                {timeSlots.map(({ hour, label, value }) => (
                  <div key={hour} className="grid grid-cols-[80px_repeat(7,1fr)]" style={{ height: '80px' }}>
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
      </div>
    </DndContext>
  )
}
