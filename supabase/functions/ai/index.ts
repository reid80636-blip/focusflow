import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type FeatureType = 'solver' | 'explainer' | 'summarizer' | 'questions' | 'planner' | 'flashcards' | 'notes' | 'chat'

interface AIRequest {
  feature: FeatureType
  input: string
  subject?: string
  gradeLevel?: string
  summaryLength?: string
  questionCount?: number
  questionType?: string
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

    flashcards: `You are an expert at creating effective flashcards for studying.
Your role is to create clear, concise flashcards that help students memorize key concepts.
- Make the front concise (a question, term, or concept)
- Make the back a clear, memorable answer
- Focus on the most important information
- Use simple, clear language`,

    notes: `You are an expert note-taker and study assistant.
Your role is to help students create clear, organized study notes.
- Use clear headings and subheadings
- Include bullet points for key concepts
- Highlight important terms and definitions
- Organize information logically
- Keep notes concise but comprehensive`,

    chat: `You are a helpful, friendly AI study assistant. You help students learn, understand concepts, solve problems, and answer questions about any subject.

Your role is to:
- Be conversational, encouraging, and educational
- Explain concepts using clear language and examples
- When solving problems, show your work step by step
- Answer questions thoroughly but concisely
- Be patient and supportive
- Connect new ideas to things students might already know
- Use analogies and real-world examples when helpful`,
  }

  return prompts[feature]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured')
    }

    const { feature, input, subject, gradeLevel, summaryLength, questionCount, questionType } = await req.json() as AIRequest

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(feature),
          },
          {
            role: 'user',
            content: input,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Groq API error: ${error}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || 'No response generated.'

    return new Response(
      JSON.stringify({ response: content }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
