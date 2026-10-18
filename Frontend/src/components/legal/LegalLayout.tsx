/**
 * Shared shell for policy pages.
 *
 * Legal pages are read, not browsed, so this deliberately drops the landing
 * page's motion and WebGL: a narrow measure, generous leading, real heading
 * hierarchy, and a sticky table of contents. Nothing animates except the TOC
 * highlight, because someone reading a refund policy is usually mid-problem
 * and does not want a show.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { MarketingNav } from '@/components/layout/MarketingNav'
import { Footer } from '@/components/layout/Footer'

export interface Section {
  id: string
  title: string
  body: ReactNode
}

export function LegalLayout({
  title, updated, intro, sections, note,
}: {
  title: string
  updated: string
  intro: ReactNode
  sections: Section[]
  note?: ReactNode
}) {
  const [active, setActive] = useState(sections[0]?.id ?? '')

  // Highlight the section currently nearest the top of the viewport.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    )
    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [sections])

  return (
    <div className="min-h-screen bg-bg">
      <MarketingNav />

      <main className="mx-auto max-w-7xl px-5 pb-28 pt-32 lg:px-8">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={14} />
          Back to Mukku
        </Link>

        <header className="max-w-3xl">
          <h1 className="font-display text-[clamp(2.1rem,4.4vw,3.2rem)] font-semibold leading-[1.03] tracking-[-0.038em] text-fg">
            {title}
          </h1>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.1em] text-fg-subtle">
            Last updated {updated}
          </p>
          <div className="mt-7 text-[1.0625rem] leading-relaxed text-fg-muted">{intro}</div>
        </header>

        <div className="mt-14 grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          {/* Contents */}
          <nav className="hidden lg:block">
            <div className="sticky top-24">
              <p className="label-mono mb-4">Contents</p>
              <ul className="space-y-1.5 border-l border-border-hair">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className={
                        '-ml-px block border-l py-1 pl-4 text-[13px] leading-snug transition-colors ' +
                        (active === s.id
                          ? 'border-brand text-brand'
                          : 'border-transparent text-fg-subtle hover:text-fg-muted')
                      }
                    >
                      <span className="mr-1.5 font-mono text-[10px] opacity-60">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Body — measure capped near 70 characters for readability */}
          <article className="max-w-[68ch] space-y-12">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-28">
                <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-fg">
                  <span className="mr-2.5 font-mono text-xs text-fg-subtle">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {s.title}
                </h2>
                <div className="legal-body mt-4 space-y-4 text-[15px] leading-[1.75] text-fg-muted">
                  {s.body}
                </div>
              </section>
            ))}

            {note && (
              <aside className="rounded-xl border border-border-hair bg-surface-2 p-5 text-sm leading-relaxed text-fg-muted">
                {note}
              </aside>
            )}
          </article>
        </div>
      </main>

      <Footer />
    </div>
  )
}
