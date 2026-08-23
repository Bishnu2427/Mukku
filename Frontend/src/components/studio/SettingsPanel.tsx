import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { SegControl } from '@/components/ui/SegControl'
import {
  ASPECT_RATIOS, DURATIONS, IMAGE_STYLES, LANGUAGES, PLATFORMS,
  PLATFORM_PRESETS, TONES, VOICES,
} from '@/lib/constants'
import type { Settings } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** Remake panel hides the platform row and tightens spacing. */
  compact?: boolean
}

export function SettingsPanel({ settings, onChange, compact = false }: Props) {
  const [advanced, setAdvanced] = useState(false)

  /** Selecting a platform also applies its preset — same as the legacy UI. */
  const pickPlatform = (platform: Settings['platform']) => {
    const preset = PLATFORM_PRESETS[platform]
    onChange(preset ? { platform, ...preset } : { platform })
  }

  return (
    <div className="flex flex-col gap-5">
      {!compact && (
        <SegControl
          label="Platform"
          scroll
          value={settings.platform}
          onChange={pickPlatform}
          options={PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
        />
      )}

      <div className={cn('grid gap-5', !compact && 'lg:grid-cols-2')}>
        <SegControl
          label="Duration"
          value={settings.duration}
          onChange={(duration) => onChange({ duration })}
          options={DURATIONS.map((d) => ({ value: d.value, label: d.label }))}
        />
        <SegControl
          label="Language"
          scroll
          value={settings.language}
          onChange={(language) => onChange({ language })}
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label, hint: l.native }))}
        />
      </div>

      <div>
        <button
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
          className="inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <SlidersHorizontal size={14} />
          Advanced settings
          <motion.span animate={{ rotate: advanced ? 180 : 0 }} transition={{ duration: 0.25 }}>
            <ChevronDown size={14} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {advanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="grid gap-5 pt-4 lg:grid-cols-2">
                <SegControl
                  label="Tone"
                  value={settings.tone}
                  onChange={(tone) => onChange({ tone })}
                  options={TONES}
                />
                <SegControl
                  label="Image style"
                  value={settings.image_style}
                  onChange={(image_style) => onChange({ image_style })}
                  options={IMAGE_STYLES}
                />
                <SegControl
                  label="Aspect ratio"
                  value={settings.aspect_ratio}
                  onChange={(aspect_ratio) => onChange({ aspect_ratio })}
                  options={ASPECT_RATIOS.map((r) => ({
                    value: r.value,
                    label: `${r.label} ${r.hint}`,
                  }))}
                />
                <SegControl
                  label="Voiceover"
                  value={settings.voice_gender}
                  onChange={(voice_gender) => onChange({ voice_gender })}
                  options={VOICES}
                />
                <SegControl
                  label="Background music"
                  value={settings.include_music ? 'on' : 'off'}
                  onChange={(v) => onChange({ include_music: v === 'on' })}
                  options={[
                    { value: 'on', label: 'On' },
                    { value: 'off', label: 'Off' },
                  ]}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
