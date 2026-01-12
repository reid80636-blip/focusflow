'use client'

// Client-side AI service that calls Supabase Edge Function
// The Edge Function securely stores the Groq API key

export type FeatureType = 'solver' | 'explainer' | 'summarizer' | 'questions' | 'planner' | 'flashcards' | 'notes' | 'chat'
export type Subject = 'math' | 'science' | 'ela' | 'social-studies'
export type GradeLevel = 'elementary' | 'middle' | 'high'
export type SummaryLength = 'brief' | 'detailed' | 'key-points'
export type QuestionType = 'multiple-choice' | 'short-answer' | 'true-false' | 'mixed'

export interface AIRequest {
  feature: FeatureType
  input: string
  subject?: Subject
  gradeLevel?: GradeLevel
  summaryLength?: SummaryLength
  questionCount?: number
  questionType?: QuestionType
}

function getSubjectName(subject: Subject): string {
  const names: Record<Subject, string> = {
    math: 'Math',
    science: 'Science',
    ela: 'English Language Arts',
    'social-studies': 'Social Studies',
  }
  return names[subject]
}

function getGradeLevelName(level: GradeLevel): string {
  const names: Record<GradeLevel, string> = {
    elementary: 'elementary school (grades 3-5)',
    middle: 'middle school (grades 6-8)',
    high: 'high school (grades 9-12)',
  }
  return names[level]
}

function getSummaryInstruction(length: SummaryLength): string {
  const instructions: Record<SummaryLength, string> = {
    brief: 'Provide a brief summary in 2-3 sentences.',
    detailed: 'Provide a detailed summary covering all main points.',
    'key-points': 'List only the key points as bullet points.',
  }
  return instructions[length]
}

function buildPrompt(request: AIRequest): string {
  const { feature, input, subject, gradeLevel, summaryLength, questionCount, questionType } = request

  const subjectName = subject ? getSubjectName(subject) : ''
  const gradeLevelName = gradeLevel ? getGradeLevelName(gradeLevel) : 'high school'

  switch (feature) {
    case 'solver':
      return `Please solve this ${subjectName} problem step-by-step:

${input}

For each step, include:
- Goal: What we want to achieve
- Process: How to do it (in simple terms)
- Result: What we get

Use plain text only - no special math symbols. End with the final answer.`

    case 'explainer':
      return `Please explain this concept/text at a ${gradeLevelName} level:

${input}

Make it easy to understand with examples and analogies.`

    case 'summarizer':
      const lengthInstruction = getSummaryInstruction(summaryLength || 'detailed')
      return `Please summarize the following text. ${lengthInstruction}

${input}`

    case 'questions':
      const count = questionCount || 5
      const type = questionType || 'mixed'
      return `Based on the following study material, generate ${count} practice questions.
Question type: ${type}
Subject: ${subjectName || 'General'}

Study Material:
${input}

Include the correct answers with brief explanations after each question.`

    case 'planner':
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' })
      return `Parse this activity description into structured task data.
Today is ${dayOfWeek}, ${todayStr}.

User input: "${input}"

Return ONLY a JSON object with these fields:
{
  "title": "activity name (extracted or inferred)",
  "date": "YYYY-MM-DD format",
  "time": "HH:MM in 24-hour format (or null if not specified)",
  "duration": number in minutes (default 60 if not specified),
  "subject": "math" | "science" | "ela" | "social-studies" | "general",
  "confidence": number between 0 and 1
}

Examples:
- "math homework tomorrow at 3pm" → date is tomorrow, time is 15:00, subject is math
- "study for science test next monday for 2 hours" → duration is 120, subject is science
- "read chapter 5" → no time specified, general subject, duration 60

Return ONLY the JSON, no explanation.`

    case 'flashcards':
      return input  // The input already contains the full prompt for flashcards

    case 'notes':
      return input  // The input already contains the full prompt for notes

    case 'chat':
      return `You are a helpful, friendly AI study assistant. You help students learn, understand concepts, solve problems, and answer questions about any subject.

Be conversational, encouraging, and educational. When explaining concepts, use clear language and examples. If asked to solve problems, show your work step by step.

Student's question:
${input}

Provide a helpful, clear response.`

    default:
      return input
  }
}

export async function generateAIResponse(request: AIRequest): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing.')
  }

  // Call the Supabase Edge Function
  const response = await fetch(`${supabaseUrl}/functions/v1/ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      feature: request.feature,
      input: buildPrompt(request),
      subject: request.subject,
      gradeLevel: request.gradeLevel,
      summaryLength: request.summaryLength,
      questionCount: request.questionCount,
      questionType: request.questionType,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AI request failed: ${error}`)
  }

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error)
  }

  return data.response || 'No response generated.'
}
