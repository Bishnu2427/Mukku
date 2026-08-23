import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-5">
      <div
        className="animate-drift pointer-events-none absolute left-1/2 top-1/4 h-[50vh] w-[60vw] -translate-x-1/2 rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--aurora-1), transparent 70%)' }}
      />
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative text-center"
      >
        <span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-border-accent bg-brand-soft text-brand">
          <Compass size={26} />
        </span>
        <p className="label-mono text-brand">404</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-fg">Nothing here</h1>
        <p className="mx-auto mt-3 max-w-sm text-base text-fg-muted">
          This page does not exist. It may have moved, or the link may be out of date.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/">
            <Button icon={<ArrowLeft size={15} />}>Back home</Button>
          </Link>
          <Link to="/studio">
            <Button variant="secondary">Open Studio</Button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
