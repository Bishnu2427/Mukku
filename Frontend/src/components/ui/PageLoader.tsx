import { motion } from 'motion/react'

/** Route-transition fallback. Deliberately quiet — it should read as a
 *  breath, not a spinner competing for attention. */
export function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-11 w-11">
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-border-hair"
          />
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{ borderTopColor: 'var(--brand)' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        </div>
        <motion.span
          className="label-mono"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          Loading
        </motion.span>
      </div>
    </div>
  )
}
