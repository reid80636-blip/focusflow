import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export type FeatureType = 'solver' | 'explainer' | 'summarizer' | 'questions' | 'planner'
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

export async function generateAIResponse(request: AIRequest): Promise<string> {
  const prompt = buildPrompt(request)

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: getSystemPrompt(request.feature),
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 4096,
  })

  return completion.choices[0]?.message?.content || 'No response generated.'
}

function getSystemPrompt(feature: FeatureType): string {
  const prompts: Record<FeatureType, string> = {
    solver: `You are an expert tutor helping students solve problems step-by-step.
Your role is to break down problems into clear, numbered steps that students can follow.

For EACH step, structure your response like this:
Step [number]: [Short title describing what we do]

Goal: [One sentence explaining what we want to achieve in this step]

Process: [Clear explanation of how to do it, broken into short sentences]

Result: [What we get after completing this step]

Tip: [Optional helpful hint or common mistake to avoid]

Rules:
- Use simple, plain language (no LaTeX, no special symbols like $ or \\boxed)
- Write numbers and equations in plain text (like "2x + 5 = 15" not "$2x + 5 = 15$")
- Keep each section short (1-2 sentences max)
- Make the final step extra clear with the complete answer
- End with "Final Answer: [the answer in plain text]"`,

    explainer: `You are a patient and clear teacher who explains concepts to students.
Your role is to make complex topics easy to understand.
- Use simple, age-appropriate language
- Provide relatable examples and analogies
- Break down concepts into digestible parts
- Connect new ideas to things students already know
- Be encouraging and supportive`,

    summarizer: `You are an expert at condensing information into clear, concise summaries.
Your role is to help students understand key points from their study materials.
- Identify and highlight the main ideas
- Remove unnecessary details while keeping essential information
- Use bullet points for clarity
- Maintain the original meaning and accuracy
- Organize information logically`,

    questions: `You are a test preparation expert who creates practice questions.
Your role is to help students test their knowledge.
- Create clear, well-written questions
- Include a mix of difficulty levels
- For multiple choice, include plausible distractors
- Provide correct answers with brief explanations
- Focus on key concepts and understanding`,

    planner: `You are a smart scheduling assistant that parses natural language into structured task data.
Your role is to extract activity details from casual descriptions.
- Parse dates relative to today (tomorrow, next Monday, etc.)
- Extract times in 24-hour format
- Estimate reasonable durations if not specified
- Identify subject categories when mentioned
- Return ONLY valid JSON, no other text`,
  }

  return prompts[feature]
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

    default:
      return input
  }
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

export { groq }
