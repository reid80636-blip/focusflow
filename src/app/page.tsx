import Link from 'next/link'

const features = [
  {
    title: 'Problem Solver',
    description: 'Step-by-step solutions that help you understand, not just answer.',
    href: '/solver',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    color: 'blue',
    accent: 'accent-blue',
  },
  {
    title: 'Concept Explainer',
    description: 'Clear explanations with examples and analogies at your level.',
    href: '/explainer',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: 'purple',
    accent: 'accent-purple',
  },
  {
    title: 'Summarizer',
    description: 'Turn long texts into organized study notes in seconds.',
    href: '/summarizer',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
    color: 'green',
    accent: 'accent-green',
  },
  {
    title: 'Practice Quiz',
    description: 'Generate custom quizzes to test what you\'ve learned.',
    href: '/questions',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    color: 'amber',
    accent: 'amber-500',
  },
]

const colorClasses = {
  blue: {
    bg: 'bg-accent-blue/10',
    border: 'border-accent-blue/20',
    text: 'text-accent-blue',
    hover: 'group-hover:bg-accent-blue/20 group-hover:border-accent-blue/40',
    glow: 'group-hover:shadow-accent-blue/20',
  },
  purple: {
    bg: 'bg-accent-purple/10',
    border: 'border-accent-purple/20',
    text: 'text-accent-purple',
    hover: 'group-hover:bg-accent-purple/20 group-hover:border-accent-purple/40',
    glow: 'group-hover:shadow-accent-purple/20',
  },
  green: {
    bg: 'bg-accent-green/10',
    border: 'border-accent-green/20',
    text: 'text-accent-green',
    hover: 'group-hover:bg-accent-green/20 group-hover:border-accent-green/40',
    glow: 'group-hover:shadow-accent-green/20',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-500',
    hover: 'group-hover:bg-amber-500/20 group-hover:border-amber-500/40',
    glow: 'group-hover:shadow-amber-500/20',
  },
}

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center py-12 sm:py-16">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-green/10 border border-accent-green/20 text-accent-green text-sm font-medium mb-8">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Powered by AI
        </div>

        {/* Main Heading */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text-primary tracking-tight max-w-4xl">
          Study smarter,{' '}
          <span className="relative">
            <span className="bg-gradient-to-r from-accent-blue via-accent-purple to-accent-green bg-clip-text text-transparent">
              not harder
            </span>
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-text-secondary max-w-2xl leading-relaxed">
          AI-powered tools that help you understand concepts, solve problems, and ace your exams.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/solver"
            className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-accent-blue to-accent-purple text-white font-semibold rounded-2xl hover:opacity-90 transition-all hover:scale-105 hover:shadow-lg hover:shadow-accent-purple/20 flex items-center justify-center gap-2"
          >
            Get Started
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/explainer"
            className="w-full sm:w-auto px-8 py-4 bg-bg-card border-2 border-border-default text-text-primary font-semibold rounded-2xl hover:border-accent-blue/50 hover:bg-bg-elevated transition-all flex items-center justify-center gap-2"
          >
            See How It Works
          </Link>
        </div>

        {/* Subjects */}
        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {['Math', 'Science', 'English', 'History'].map((subject) => (
            <span
              key={subject}
              className="px-3 py-1.5 bg-bg-secondary rounded-lg text-text-muted text-sm"
            >
              {subject}
            </span>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 border-t border-border-default">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature) => {
            const colors = colorClasses[feature.color as keyof typeof colorClasses]
            return (
              <Link key={feature.href} href={feature.href} className="group">
                <div className={`h-full p-6 rounded-2xl border-2 border-border-default bg-bg-card transition-all duration-300 hover:border-transparent hover:shadow-xl ${colors.glow} group-hover:translate-y-[-2px]`}>
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-xl ${colors.bg} ${colors.border} border ${colors.hover} ${colors.text} flex items-center justify-center transition-all duration-300`}>
                    {feature.icon}
                  </div>

                  {/* Content */}
                  <h3 className="mt-4 text-lg font-semibold text-text-primary group-hover:text-white transition-colors">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Arrow */}
                  <div className={`mt-4 flex items-center gap-1 text-sm font-medium ${colors.text} opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-8px] group-hover:translate-x-0`}>
                    <span>Open</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-12 border-t border-border-default">
        <div className="bg-gradient-to-br from-bg-card to-bg-elevated rounded-3xl p-8 sm:p-12 border border-border-default relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-accent-blue/10 to-accent-purple/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-br from-accent-green/10 to-accent-teal/10 rounded-full blur-3xl" />

          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-text-primary">
                Ready to boost your grades?
              </h2>
              <p className="mt-2 text-text-secondary">
                Start using AI-powered study tools today — it&apos;s free.
              </p>
            </div>
            <Link
              href="/solver"
              className="flex-shrink-0 px-8 py-4 bg-white text-bg-primary font-semibold rounded-2xl hover:bg-text-primary transition-all hover:scale-105 flex items-center gap-2"
            >
              Start Learning
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
