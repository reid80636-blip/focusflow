'use client'

import { TextareaHTMLAttributes, forwardRef } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  hint?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', label, error, icon, hint, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-text-primary mb-2"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute top-4 left-4 text-text-muted pointer-events-none">
              {icon}
            </div>
          )}
          <textarea
            ref={ref}
            id={textareaId}
            className={`w-full bg-bg-elevated/50 border-2 border-border-default rounded-2xl px-5 py-4 text-text-primary text-lg placeholder-text-muted/60 transition-all duration-300 focus:outline-none focus:border-accent-green focus:bg-bg-elevated focus:shadow-lg focus:shadow-accent-green/5 resize-none ${
              icon ? 'pl-12' : ''
            } ${
              error ? 'border-error focus:border-error focus:shadow-error/5' : ''
            } ${className}`}
            {...props}
          />
        </div>
        {hint && !error && (
          <p className="mt-2 text-sm text-text-muted flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {hint}
          </p>
        )}
        {error && (
          <p className="mt-2 text-sm text-error flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

export { Textarea }
