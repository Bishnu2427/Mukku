/**
 * GLSL for the hero backdrop — "Dusk on the Lake".
 *
 * Everything animates on the GPU. The CPU's entire per-frame responsibility is
 * writing three floats (time, pointer x/y) into uniforms; there is no geometry
 * to update, no buffer to re-upload, and no JavaScript loop over vertices.
 *
 * This is the distinction that matters for performance: the previous version
 * repositioned ~9,600 points in JS every frame. A fragment shader does the
 * equivalent work per-pixel in parallel on dedicated silicon, which is both
 * faster and capable of effects — refraction, layered FBM, chromatic
 * dispersion — that are simply not expressible in CSS.
 *
 * Geometry is a single fullscreen triangle. No vertex work at all.
 */

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Position is already in clip space for a fullscreen quad — skip the
    // projection matrix entirely.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec2  uPointer;      // -1..1, eased on the CPU
  uniform float uIntensity;    // 0 when offscreen, 1 when visible — fades out
  uniform vec3  uSky;          // palette, supplied from the theme tokens
  uniform vec3  uHorizon;
  uniform vec3  uDeep;
  uniform vec3  uWarm;         // the town lights on the far shore

  // ── Noise ────────────────────────────────────────────────────────────────
  // Hash-based value noise. Cheaper than Perlin and indistinguishable at the
  // scale we use it, which matters because FBM calls it 5 times per pixel.
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);          // smoothstep interpolation
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Fractal Brownian motion — layered noise at halving amplitude. This is what
  // gives the aurora its organic, non-repeating structure.
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);   // rotate each octave to kill axis bias
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Aspect-correct coordinates, origin at centre.
    vec2 uv = vUv;
    vec2 p  = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

    float t = uTime * 0.04;

    // Pointer parallax — the whole field drifts slightly toward the cursor,
    // which makes a flat shader read as having depth.
    p += uPointer * 0.035;

    // ── Aurora ─────────────────────────────────────────────────────────────
    // Two FBM fields at different speeds, warped by one another. Domain
    // warping is what stops it looking like plain cloud noise.
    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t * 0.7));
    vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.3),
                  fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.25));
    float aurora = fbm(p + 4.0 * r);

    // ── Horizon ────────────────────────────────────────────────────────────
    // One hard-ish line is what makes the soft parts read as soft.
    float horizon = 0.30;
    float above   = smoothstep(horizon - 0.002, horizon + 0.002, uv.y);

    // Mirror the sky below the horizon, compressed, for the still water.
    vec2 wp = vec2(uv.x, horizon - (uv.y - horizon) * 0.65);
    wp = (wp - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

    // Water ripples: a slow sine field, amplitude growing toward the viewer so
    // the reflection breaks up nearer the bottom of the frame.
    float depth  = smoothstep(horizon, 0.0, uv.y);
    float ripple = sin(wp.y * 85.0 - uTime * 0.9) * 0.0045 * depth
                 + sin(wp.y * 150.0 + uTime * 0.55) * 0.0022 * depth;
    wp.x += ripple;

    vec2 rq = vec2(fbm(wp + t), fbm(wp + vec2(5.2, 1.3) - t * 0.7));
    float reflection = fbm(wp + 4.0 * rq);

    float field = mix(reflection * 0.78, aurora, above);

    // ── Colour ─────────────────────────────────────────────────────────────
    // Vertical gradient from deep water, through the horizon glow, to sky.
    vec3 col = mix(uDeep, uHorizon, smoothstep(0.0, 0.62, uv.y));
    col = mix(col, uSky, smoothstep(0.38, 1.0, uv.y));

    // The aurora adds light rather than replacing colour.
    col += uHorizon * field * 0.17 * above;
    col += uDeep * reflection * 0.14 * (1.0 - above);

    // Glow concentrated just above the horizon, where dusk actually is.
    float glow = exp(-abs(uv.y - horizon) * 11.0);
    col += uHorizon * glow * 0.085;

    // ── Town lights ────────────────────────────────────────────────────────
    // Sparse warm points on the far shore, with a vertical smear in the water
    // below. Scarcity is what makes them read as distant lights rather than
    // decoration — a warm counterpoint stops the whole frame feeling cold.
    float lights = 0.0;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float lx = fract(sin(fi * 78.233) * 43758.5453);
      float d  = abs(uv.x - lx);
      // Twinkle slowly and out of phase.
      float tw = 0.6 + 0.4 * sin(uTime * 0.7 + fi * 2.1);
      float pt = exp(-d * 420.0) * exp(-abs(uv.y - horizon) * 150.0);
      float smear = exp(-d * 260.0) * smoothstep(horizon, horizon - 0.22, uv.y) * 0.35;
      lights += (pt + smear) * tw;
    }
    col += uWarm * lights * 0.55;

    // ── Finish ─────────────────────────────────────────────────────────────
    // Vignette, then dithering. Large smooth gradients band badly on 8-bit
    // displays; a sub-LSB noise offset removes it for free.
    float vig = 1.0 - 0.52 * length((uv - 0.5) * vec2(1.05, 1.0));
    col *= vig;

    col += (hash(uv * uResolution + fract(uTime)) - 0.5) / 255.0;

    gl_FragColor = vec4(col, uIntensity);
  }
`
