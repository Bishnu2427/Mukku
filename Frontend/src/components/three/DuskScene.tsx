/**
 * WebGL hero backdrop, driven entirely by a fragment shader.
 *
 * Performance contract — this is the part that makes it fast rather than the
 * thing that made the page lag before:
 *
 *   • Geometry is one fullscreen triangle. Nothing is ever re-uploaded.
 *   • All animation happens in GLSL. useFrame writes three floats per frame
 *     (time + pointer). There is no JavaScript loop over vertices.
 *   • The render loop is switched OFF entirely when the hero scrolls out of
 *     view or the tab is hidden — not merely throttled.
 *   • DPR is capped at 1.5. A 4K display would otherwise shade 4× the pixels
 *     for a backdrop nobody inspects.
 *   • Honours prefers-reduced-motion by rendering one static frame.
 *
 * Colours come from the live theme tokens, so it follows light/dark without a
 * second palette.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { fragmentShader, vertexShader } from './DuskShader'

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function useThemeColours() {
  const [theme, setTheme] = useState<string>(
    () => document.documentElement.getAttribute('data-theme') ?? 'dark',
  )

  // Re-read when the toggle flips data-theme.
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setTheme(document.documentElement.getAttribute('data-theme') ?? 'dark'))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return useMemo(() => {
    const dark = theme !== 'light'
    return {
      sky:     new THREE.Color(dark ? '#0d1120' : '#eef1f9'),
      horizon: new THREE.Color(dark ? '#3d4a8f' : '#aab9e4'),
      deep:    new THREE.Color(dark ? '#080a12' : '#dbe3f3'),
      warm:    new THREE.Color(cssVar('--color-amber-500', '#E0A85C')),
    }
  }, [theme])
}

function ShaderField({ reduced }: { reduced: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const { size } = useThree()
  const colours = useThemeColours()
  // Eased pointer, so parallax glides instead of snapping.
  const pointer = useRef(new THREE.Vector2(0, 0))
  const target = useRef(new THREE.Vector2(0, 0))

  const uniforms = useMemo(
    () => ({
      uTime:       { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPointer:    { value: new THREE.Vector2(0, 0) },
      uIntensity:  { value: 1 },
      uSky:        { value: colours.sky },
      uHorizon:    { value: colours.horizon },
      uDeep:       { value: colours.deep },
      uWarm:       { value: colours.warm },
    }),
    // colours are written in an effect below; rebuilding uniforms would
    // recompile the shader on every theme flip.
    [],  // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    uniforms.uSky.value = colours.sky
    uniforms.uHorizon.value = colours.horizon
    uniforms.uDeep.value = colours.deep
    uniforms.uWarm.value = colours.warm
  }, [colours, uniforms])

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height)
  }, [size, uniforms])

  useEffect(() => {
    if (reduced) return
    const onMove = (e: PointerEvent) => {
      target.current.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1),
      )
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduced])

  useFrame((state) => {
    if (!mat.current) return
    // Three float writes. That is the entire per-frame CPU cost.
    uniforms.uTime.value = reduced ? 8 : state.clock.elapsedTime
    pointer.current.lerp(target.current, 0.045)
    uniforms.uPointer.value.copy(pointer.current)
  })

  return (
    <mesh frustumCulled={false}>
      {/* A single triangle larger than the viewport: one fewer vertex than a
          quad and no diagonal seam. */}
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3]}
        />
        <bufferAttribute
          attach="attributes-uv"
          args={[new Float32Array([0, 0, 2, 0, 0, 2]), 2]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

export default function DuskScene({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(true)
  const reduced = useMemo(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  // Stop the render loop completely when the hero is off screen or the tab is
  // backgrounded. A paused WebGL canvas costs nothing; a running one costs a
  // full-screen shader pass every frame forever.
  useEffect(() => {
    const el = host.current
    if (!el) return

    let onScreen = true
    const sync = () => setActive(onScreen && document.visibilityState === 'visible')

    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync() },
                                        { threshold: 0.01 })
    io.observe(el)
    document.addEventListener('visibilitychange', sync)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [])

  return (
    <div ref={host} className={className} aria-hidden>
      <Canvas
        // Reduced motion renders a single frame and then stops.
        frameloop={reduced ? 'demand' : active ? 'always' : 'never'}
        dpr={[1, 1.5]}
        gl={{
          antialias: false,        // the shader is smooth; MSAA buys nothing
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: false,
        }}
        // Orthographic with no camera work — the triangle is already in clip space.
        orthographic
        camera={{ position: [0, 0, 1] }}
      >
        <ShaderField reduced={reduced} />
      </Canvas>
    </div>
  )
}
