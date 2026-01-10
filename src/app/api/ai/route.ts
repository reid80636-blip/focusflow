import { NextRequest, NextResponse } from 'next/server'
import { generateAIResponse, AIRequest } from '@/lib/groq'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body: AIRequest = await request.json()

    if (!body.input || !body.feature) {
      return NextResponse.json(
        { error: 'Missing required fields: input and feature' },
        { status: 400 }
      )
    }

    const response = await generateAIResponse(body)

    // Try to save to database if user is authenticated
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        await supabase.from('study_sessions').insert({
          user_id: user.id,
          feature_type: body.feature,
          subject: body.subject || null,
          input_text: body.input,
          output_text: response,
        })
      }
    } catch {
      // Silently fail if database save fails - don't break the main functionality
      console.error('Failed to save session to database')
    }

    return NextResponse.json({ response })
  } catch (error) {
    console.error('AI API Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response. Please try again.' },
      { status: 500 }
    )
  }
}
