'use client'

import { useState, useRef, useEffect } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label?: string
  options: SelectOption[]
  value: string
  onChange: (e: { target: { value: string } }) => void
  error?: string
  icon?: React.ReactNode
  className?: string
  id?: string
}

const Select = ({ className = '', label, options, value, onChange, error, icon, id }: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectRef = useRef<HTMLDivElement>(null)
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

  const selectedOption = options.find(opt => opt.value === value)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const handleSelect = (optionValue: string) => {
    onChange({ target: { value: optionValue } })
    setIsOpen(false)
  }

  return (
    <div className="w-full" ref={selectRef}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-text-primary mb-2"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {/* Trigger Button */}
        <button
          type="button"
          id={selectId}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full bg-bg-elevated/50 border-2 border-border-default rounded-xl px-4 py-3 text-left text-text-primary font-medium transition-all duration-300 focus:outline-none focus:border-accent-green focus:bg-bg-elevated focus:shadow-lg focus:shadow-accent-green/5 cursor-pointer pr-10 ${
            icon ? 'pl-11' : ''
          } ${
            isOpen ? 'border-accent-green bg-bg-elevated shadow-lg shadow-accent-green/5' : ''
          } ${
            error ? 'border-error focus:border-error focus:shadow-error/5' : ''
          } ${className}`}
        >
          {icon && (
            <div className="absolute top-1/2 -translate-y-1/2 left-4 text-text-muted pointer-events-none">
              {icon}
            </div>
          )}
          <span>{selectedOption?.label || 'Select...'}</span>
          {/* Chevron */}
          <div className={`absolute top-1/2 -translate-y-1/2 right-3 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-bg-card border-2 border-border-default rounded-xl shadow-2xl shadow-black/20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="py-1 max-h-64 overflow-y-auto">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`w-full px-4 py-3 text-left transition-all duration-150 flex items-center justify-between group ${
                    option.value === value
                      ? 'bg-accent-green/20 text-accent-green'
                      : 'text-text-primary hover:bg-bg-elevated'
                  }`}
                >
                  <span className="font-medium">{option.label}</span>
                  {option.value === value && (
                    <svg className="w-5 h-5 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
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

export { Select }
