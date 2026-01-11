'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SummarizerRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/tools?tab=summarizer')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-text-secondary">Redirecting to AI Tools...</div>
    </div>
  )
}
