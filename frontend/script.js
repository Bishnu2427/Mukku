/**
 * AI Video Generator — frontend logic
 *
 * Flow:
 *  1. User types prompt → clicks Generate
 *  2. POST /generate → get project_id
 *  3. Poll GET /status/{id} every 3 s
 *  4. Update progress bar + step indicators + script/scene previews
 *  5. On completion → show video player + download link
 *  6. On failure    → show error card
 */

const API_BASE     = '';          // same origin (Flask serves the frontend)
const POLL_MS      = 3000;        // status poll interval
const STEP_ORDER   = [
  'analyzing_prompt',
  'generating_script',
  'planning_scenes',
  'generating_images',
  'generating_clips',
  'generating_voices',
  'generating_music',
  'assembling_video',
  'completed',
];

let _pollTimer   = null;
let _projectId   = null;

// ── Platform presets ──────────────────────────────────────────────────────────

const PLATFORM_PRESETS = {
  youtube:          { aspect_ratio: '16:9', duration: '120', tone: 'educational',   image_style: 'cinematic'       },
  youtube_shorts:   { aspect_ratio: '9:16', duration: '60',  tone: 'entertaining',  image_style: 'photorealistic'  },
  tiktok:           { aspect_ratio: '9:16', duration: '60',  tone: 'entertaining',  image_style: 'photorealistic'  },
  instagram_reels:  { aspect_ratio: '9:16', duration: '30',  tone: 'casual',        image_style: 'cinematic'       },
  instagram_post:   { aspect_ratio: '1:1',  duration: '60',  tone: 'professional',  image_style: 'photorealistic'  },
  linkedin:         { aspect_ratio: '16:9', duration: '90',  tone: 'professional',  image_style: 'documentary'     },
  twitter:          { aspect_ratio: '16:9', duration: '60',  tone: 'casual',        image_style: 'photorealistic'  },
};

function applyPlatformPreset(platform) {
  const preset = PLATFORM_PRESETS[platform];
  if (!preset) return;

  // Set aspect ratio
  setSegValue('ratioSeg',    preset.aspect_ratio);
  // Set duration
  setSegValue('durationSeg', preset.duration);
  // Set tone
  setSegValue('toneSeg',     preset.tone);
  // Set image style
  setSegValue('styleSeg',    preset.image_style);
}

function setSegValue(segId, value) {
  const seg = document.getElementById(segId);
  if (!seg) return;
  seg.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === value);
  });
}

// ── Settings helpers ──────────────────────────────────────────────────────────

function getSegValue(segId) {
  const active = document.querySelector(`#${segId} .seg-btn.active`);
  return active ? active.dataset.value : null;
}

function collectSettings() {
  return {
    duration:      parseInt(getSegValue('durationSeg') || '60', 10),
    tone:          getSegValue('toneSeg')      || 'educational',
    image_style:   getSegValue('styleSeg')     || 'photorealistic',
    aspect_ratio:  getSegValue('ratioSeg')     || '16:9',
    voice_gender:  getSegValue('voiceSeg')     || 'auto',
    include_music: getSegValue('musicSeg')     === 'true',
    platform:      getSegValue('platformSeg')  || '',
    language:      getSegValue('languageSeg')  || 'en',
  };
}

function toggleSettings() {
  const body  = document.getElementById('settingsBody');
  const arrow = document.getElementById('settingsArrow');
  const open  = body.classList.toggle('open');
  arrow.classList.toggle('open', open);
}

// Segmented control click handler
document.addEventListener('click', e => {
  if (!e.target.classList.contains('seg-btn')) return;
  const parent = e.target.closest('.seg-control');
  if (!parent) return;
  parent.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  // If a platform button was clicked, apply preset
  if (parent.id === 'platformSeg') {
    applyPlatformPreset(e.target.dataset.value);
  }
});

// ── Entry point ──────────────────────────────────────────────────────────────

async function startGeneration() {
  const input  = document.getElementById('promptInput');
  const prompt = input.value.trim();

  clearError();

  if (!prompt) {
    showError('Please enter a video prompt before generating.');
    return;
  }
  if (prompt.length < 10) {
    showError('Your prompt is too short — please describe your video in more detail.');
    return;
  }

  const settings = collectSettings();
  setGenerating(true);

  try {
    const res  = await fetch(`${API_BASE}/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, settings }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    _projectId = data.project_id;
    showProgressSection();
    startPolling(_projectId);
  } catch (err) {
    setGenerating(false);
    showError(err.message);
  }
}

// ── Polling ──────────────────────────────────────────────────────────────────

function startPolling(projectId) {
  stopPolling();
  _pollTimer = setInterval(() => pollStatus(projectId), POLL_MS);
  pollStatus(projectId);   // immediate first call
}

function stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

async function pollStatus(projectId) {
  try {
    const res  = await fetch(`${API_BASE}/status/${projectId}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Status fetch failed');

    updateProgress(data);

    if (data.status === 'completed') {
      stopPolling();
      showResult(projectId);
    } else if (data.status === 'failed') {
      stopPolling();
      showErrorSection(data.error || 'An unknown error occurred during generation.');
    }
  } catch (err) {
    console.error('Poll error:', err);
    // Don't stop polling on transient network errors — keep retrying
  }
}

// ── Progress UI ──────────────────────────────────────────────────────────────

function updateProgress(data) {
  const pct     = Math.min(100, Math.max(0, data.progress || 0));
  const step    = data.current_step || '';

  document.getElementById('progressBar').style.width = `${pct}%`;
  document.getElementById('progressPct').textContent = `${pct}%`;

  // Update step dots
  const stepIdx = STEP_ORDER.indexOf(step);
  STEP_ORDER.forEach((s, i) => {
    const el = document.querySelector(`.step[data-step="${s}"]`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < stepIdx)        el.classList.add('done');
    else if (i === stepIdx) el.classList.add('active');
  });

  // Show sub-step detail (e.g. "Image 3 of 10…") on the active step
  const detailEl = document.getElementById('stepDetail');
  if (detailEl) {
    detailEl.textContent = data.step_detail || '';
  }

  // Show script when available
  if (data.script) {
    const preview = document.getElementById('scriptPreview');
    const text    = document.getElementById('scriptText');
    preview.classList.remove('hidden');
    text.textContent = data.script;
  }

  // Show scenes when available
  if (data.scenes && data.scenes.length > 0) {
    renderScenes(data.scenes);
  }
}

function renderScenes(scenes) {
  const preview = document.getElementById('scenesPreview');
  const grid    = document.getElementById('scenesGrid');
  preview.classList.remove('hidden');
  grid.innerHTML = '';

  scenes.forEach(scene => {
    const card = document.createElement('div');
    card.className = 'scene-card';
    card.innerHTML = `
      <div class="scene-num">Scene ${scene.scene_number}</div>
      <div class="scene-narration">${escapeHtml(scene.narration || '')}</div>
      <div class="scene-duration">${scene.duration || '?'}s</div>
    `;
    grid.appendChild(card);
  });
}

// ── Show / hide sections ─────────────────────────────────────────────────────

function showProgressSection() {
  document.getElementById('inputSection').classList.add('hidden');
  document.getElementById('progressSection').classList.remove('hidden');
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('errorSection').classList.add('hidden');
}

function showResult(projectId) {
  document.getElementById('progressSection').classList.add('hidden');
  const resultSection = document.getElementById('resultSection');
  resultSection.classList.remove('hidden');

  const videoSrc  = `${API_BASE}/video/${projectId}`;
  const dlSrc     = `${API_BASE}/video/${projectId}?download=true`;

  document.getElementById('videoPlayer').src = videoSrc;
  document.getElementById('downloadBtn').href = dlSrc;

  resultSection.scrollIntoView({ behavior: 'smooth' });
}

function showErrorSection(detail) {
  document.getElementById('progressSection').classList.add('hidden');
  document.getElementById('errorSection').classList.remove('hidden');
  document.getElementById('errorDetail').textContent = detail;
}

function resetUI() {
  stopPolling();
  _projectId = null;

  document.getElementById('inputSection').classList.remove('hidden');
  document.getElementById('progressSection').classList.add('hidden');
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('errorSection').classList.add('hidden');

  // Reset progress
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressPct').textContent  = '0%';
  document.getElementById('scriptPreview').classList.add('hidden');
  document.getElementById('scenesPreview').classList.add('hidden');
  document.getElementById('scenesGrid').innerHTML = '';

  STEP_ORDER.forEach(s => {
    const el = document.querySelector(`.step[data-step="${s}"]`);
    if (el) el.classList.remove('active', 'done');
  });

  setGenerating(false);
  clearError();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function setGenerating(active) {
  const btn = document.getElementById('generateBtn');
  btn.disabled = active;
  btn.innerHTML = active
    ? '<span class="btn-icon" style="animation:spin 1s linear infinite">&#9696;</span> Generating…'
    : '<span class="btn-icon">&#9654;</span> Generate Video';
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  document.getElementById('errorMsg').classList.add('hidden');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Example prompt buttons ────────────────────────────────────────────────────

document.querySelectorAll('.example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('promptInput');
    input.value = btn.dataset.prompt;
    updateCharCount();
    input.focus();
  });
});

// ── Character counter ────────────────────────────────────────────────────────

function updateCharCount() {
  const input = document.getElementById('promptInput');
  document.getElementById('charCount').textContent = input.value.length;
}

document.getElementById('promptInput').addEventListener('input', updateCharCount);

// ── Ctrl+Enter shortcut ───────────────────────────────────────────────────────

document.getElementById('promptInput').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') startGeneration();
});

// ── Spin keyframe (inline for the loading icon) ───────────────────────────────

const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
