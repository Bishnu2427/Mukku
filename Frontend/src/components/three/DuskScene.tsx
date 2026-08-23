import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useTheme } from '@/providers/ThemeProvider'
import { prefersReducedMotion } from '@/lib/utils'

/**
 * "Dusk on the Lake" — the hero backdrop.
 *
 * Two layers, both point clouds so it stays cheap on integrated GPUs:
 *   1. WaveField — a grid on the XZ plane displaced by crossed sine waves.
 *      Reads as the still water in the reference photograph.
 *   2. Motes     — slow drifting particles, most periwinkle, a few amber.
 *      Those warm ones are the town lights on the far shore.
 *
 * Honours prefers-reduced-motion by rendering a single static frame.
 */

const PERIWINKLE = new THREE.Color('#7d8fde')
const LAVENDER   = new THREE.Color('#a99bc8')
const AMBER      = new THREE.Color('#e0a85c')

function WaveField({ dim = 96, spacing = 0.62 }: { dim?: number; spacing?: number }) {
  const ref = useRef<THREE.Points>(null)
  const still = prefersReducedMotion()

  const { positions, colors, base } = useMemo(() => {
    const count = dim * dim
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const base = new Float32Array(count * 2)
    const half = (dim * spacing) / 2
    let i = 0
    for (let x = 0; x < dim; x++) {
      for (let z = 0; z < dim; z++) {
        const px = x * spacing - half
        const pz = z * spacing - half
        positions[i * 3] = px
        positions[i * 3 + 1] = 0
        positions[i * 3 + 2] = pz
        base[i * 2] = px
        base[i * 2 + 1] = pz

        // Fade from periwinkle at the horizon to lavender near the camera,
        // mirroring how the sky colour sinks into the water in the photo.
        const t = THREE.MathUtils.clamp((pz + half) / (dim * spacing), 0, 1)
        const c = PERIWINKLE.clone().lerp(LAVENDER, t)
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
        i++
      }
    }
    return { positions, colors, base }
  }, [dim, spacing])

  useFrame(({ clock }) => {
    if (still || !ref.current) return
    const t = clock.getElapsedTime() * 0.32
    const arr = ref.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < base.length / 2; i++) {
      const x = base[i * 2]
      const z = base[i * 2 + 1]
      arr[i * 3 + 1] =
        Math.sin(x * 0.22 + t) * 0.5 +
        Math.cos(z * 0.17 - t * 0.8) * 0.42 +
        Math.sin((x + z) * 0.09 + t * 0.5) * 0.3
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref} rotation={[0, 0, 0]} position={[0, -6, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.075}
        vertexColors
        transparent
        opacity={0.72}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function Motes({ count = 420 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null)
  const still = prefersReducedMotion()

  const { positions, colors, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 46
      positions[i * 3 + 1] = Math.random() * 20 - 4
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30
      // ~12% warm. Sparse on purpose — that scarcity is what makes them read
      // as distant lights rather than decoration.
      const c = Math.random() < 0.12 ? AMBER : PERIWINKLE.clone().lerp(LAVENDER, Math.random())
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
      speeds[i] = 0.12 + Math.random() * 0.3
    }
    return { positions, colors, speeds }
  }, [count])

  useFrame(({ clock }) => {
    if (still || !ref.current) return
    const t = clock.getElapsedTime()
    const arr = ref.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * 0.006
      if (arr[i * 3 + 1] > 16) arr[i * 3 + 1] = -6
      arr[i * 3] += Math.sin(t * 0.22 + i) * 0.0016
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.13}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/** Eased camera parallax. Pointer only — no gyroscope surprises on mobile. */
function CameraRig() {
  const { camera, pointer } = useThree()
  const still = prefersReducedMotion()
  useFrame(() => {
    if (still) return
    camera.position.x += (pointer.x * 2.6 - camera.position.x) * 0.028
    camera.position.y += (2.2 + pointer.y * 1.2 - camera.position.y) * 0.028
    camera.lookAt(0, -1.5, 0)
  })
  return null
}

export default function DuskScene({ className }: { className?: string }) {
  const { theme } = useTheme()
  const fog = theme === 'dark' ? '#10131f' : '#f6f8fc'

  return (
    <div className={className} aria-hidden>
      <Canvas
        // Cap DPR — a retina laptop otherwise renders 4x the pixels for a
        // background nobody is inspecting closely.
        dpr={[1, 1.6]}
        camera={{ position: [0, 2.2, 15], fov: 62 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        // Pause the loop whenever the tab is hidden.
        frameloop="always"
      >
        <fog attach="fog" args={[fog, 14, 40]} />
        <CameraRig />
        <WaveField />
        <Motes />
      </Canvas>
    </div>
  )
}
