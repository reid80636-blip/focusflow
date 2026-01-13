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
    solver: `Solve step-by-step. Be concise. Use plain text for equations. End with "Final Answer: [answer]"`,

    explainer: `Explain simply with examples. Be brief and clear.`,

    summarizer: `Summarize key points as brief bullet points.`,

    questions: `Create practice questions with answers. Be concise.`,

    planner: `Parse into JSON: {title, date (YYYY-MM-DD), time (HH:MM), duration (mins), subject}. Only output JSON.`,

    flashcards: `Create flashcards. Format: Front: [term] Back: [definition]. Be concise.`,

    notes: `Create brief study notes with bullet points.`,

    chat: `Be a helpful, concise study assistant. Give short, clear answers.`,
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
        max_tokens: 1024,
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
