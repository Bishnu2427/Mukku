import { Link } from 'react-router-dom'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Studio', to: '/studio' },
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Pricing', to: '/#pricing' },
      { label: 'How it works', to: '/#how' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Create account', to: '/register' },
      { label: 'Reset password', to: '/forgot-password' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact', to: '/#contact' },
      { label: 'FAQ', to: '/#faq' },
    ],
  },
]

const POWERED = ['Groq', 'Leonardo', 'Veo', 'Kling', 'Suno', 'FFmpeg']

export function Footer() {
  return (
    <footer className="border-t border-border-hair bg-bg-deep">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/static/mukku_logo.png" alt="" className="h-7 w-7 rounded-md" />
              <span className="font-display text-[15px] font-semibold tracking-tight text-fg">
                Mukku<span className="text-brand"> AI</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
              Text to finished video, in twelve languages, without opening an editor.
            </p>
            <div className="mt-6 flex flex-wrap gap-1.5">
              {POWERED.map((p) => (
                <span
                  key={p}
                  className="rounded-md border border-border-hair px-2 py-0.5 font-mono text-2xs text-fg-subtle"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="label-mono">{col.title}</h4>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-sm text-fg-muted transition-colors hover:text-fg"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border-hair pt-7 sm:flex-row">
          <p className="font-mono text-2xs text-fg-subtle">
            © {new Date().getFullYear()} Mukku AI Studio
          </p>
          <p className="font-mono text-2xs text-fg-subtle">
            Ready for YouTube · Shorts · Reels · TikTok · LinkedIn · X
          </p>
        </div>
      </div>
    </footer>
  )
}
