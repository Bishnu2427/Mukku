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

const API_BASE = '';          // same origin (Flask serves the frontend)
const POLL_MS  = 3000;        // status poll interval

// ── Engaging wait messages per pipeline stage ─────────────────────────────────
const WAIT_MESSAGES = {
  analyzing_prompt: [
    'Reading your idea carefully...',
    'Understanding the story you want to tell...',
    'Extracting the essence of your topic...',
  ],
  generating_script: [
    'Writing your script — every great video starts with great words...',
    'Crafting narration that will captivate your audience...',
    'Turning your idea into a compelling story...',
  ],
  planning_scenes: [
    'Mapping out your visual journey...',
    'Breaking your story into cinematic moments...',
    'Designing the flow of your video...',
  ],
  generating_images: [
    'Wait buddy, good things take time!',
    'Leonardo.ai is painting your scenes — pixel by pixel...',
    'Creating visuals worthy of a Hollywood production...',
    'AI is working overtime on your images — sit tight!',
    'Every great visual takes a moment to perfect...',
    'Your images are being crafted with precision...',
    'Almost there — quality visuals are worth the wait!',
    'The AI artist is in the zone — trust the process!',
    'Rendering your vision into stunning imagery...',
    'Great content is never rushed — hang tight!',
  ],
  generating_clips: [
    'Breathing life into your static images...',
    'Animating your scenes — this is where the magic happens!',
    'Your video clips are coming alive frame by frame...',
    'Hold on — the AI animator is doing its thing!',
    'Turning images into cinematic motion...',
    'Almost through — your video will be worth the wait!',
  ],
  generating_voices: [
    'Finding the perfect voice for your content...',
    'Synthesizing narration in your chosen language...',
    'Your voiceover is being recorded by AI...',
  ],
  generating_music: [
    'Composing a soundtrack that fits your vibe...',
    'Suno AI is creating your background music...',
    'The perfect tune is being crafted for your video...',
  ],
  assembling_video: [
    'Cutting and stitching your masterpiece together...',
    'FFmpeg is merging all the elements...',
    'Mixing audio, visuals and music — almost done!',
    'Your video is taking its final shape...',
    'Adding the last finishing touches...',
  ],
};

let _waitMsgTimer   = null;
let _waitMsgIndex   = 0;
let _currentStepKey = '';

function _startWaitMessages(step) {
  _stopWaitMessages();
  _currentStepKey = step;
  _waitMsgIndex   = 0;
  const msgs = WAIT_MESSAGES[step] || [];
  if (!msgs.length) return;
  const detailEl = document.getElementById('stepDetail');
  function _show() {
    if (!detailEl) return;
    const msgs = WAIT_MESSAGES[_currentStepKey] || [];
    if (!msgs.length) return;
    detailEl.style.animation = 'none';
    detailEl.offsetHeight;
    detailEl.style.animation = '';
    detailEl.textContent = msgs[_waitMsgIndex % msgs.length];
    _waitMsgIndex++;
  }
  _show();
  _waitMsgTimer = setInterval(_show, 5000);
}

function _stopWaitMessages() {
  if (_waitMsgTimer) { clearInterval(_waitMsgTimer); _waitMsgTimer = null; }
}

const STEP_ORDER = [
  'analyzing_prompt', 'generating_script', 'planning_scenes',
  'generating_images', 'generating_clips', 'generating_voices',
  'generating_music', 'assembling_video', 'completed',
];

let _pollTimer      = null;
let _projectId      = null;
let _originalPrompt = '';
let _lastSettings   = {};

// ── Platform presets ──────────────────────────────────────────────────────────

const PLATFORM_PRESETS = {
  youtube:          { aspect_ratio: '16:9', duration: '120', tone: 'educational',   image_style: 'cinematic'      },
  youtube_shorts:   { aspect_ratio: '9:16', duration: '60',  tone: 'entertaining',  image_style: 'photorealistic' },
  tiktok:           { aspect_ratio: '9:16', duration: '60',  tone: 'entertaining',  image_style: 'photorealistic' },
  instagram_reels:  { aspect_ratio: '9:16', duration: '30',  tone: 'casual',        image_style: 'cinematic'      },
  instagram_post:   { aspect_ratio: '1:1',  duration: '60',  tone: 'professional',  image_style: 'photorealistic' },
  linkedin:         { aspect_ratio: '16:9', duration: '90',  tone: 'professional',  image_style: 'documentary'    },
  twitter:          { aspect_ratio: '16:9', duration: '60',  tone: 'casual',        image_style: 'photorealistic' },
};

function applyPlatformPreset(platform) {
  const preset = PLATFORM_PRESETS[platform];
  if (!preset) return;
  setSegValue('ratioSeg',    preset.aspect_ratio);
  setSegValue('durationSeg', preset.duration);
  setSegValue('toneSeg',     preset.tone);
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
  const panel = document.getElementById('settingsToggle').closest('.settings-panel');
  const open  = body.classList.toggle('open');
  arrow.classList.toggle('open', open);
  if (open) {
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }
}

// Segmented control click handler
document.addEventListener('click', e => {
  if (!e.target.classList.contains('seg-btn')) return;
  const parent = e.target.closest('.seg-control');
  if (!parent) return;
  parent.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  if (parent.id === 'platformSeg') applyPlatformPreset(e.target.dataset.value);
});

// ── Entry point ───────────────────────────────────────────────────────────────

async function startGeneration() {
  const input  = document.getElementById('promptInput');
  const prompt = input.value.trim();

  clearError();
  if (!prompt) { showError('Please enter a video prompt before generating.'); return; }
  if (prompt.length < 10) { showError('Your prompt is too short — please describe your video in more detail.'); return; }

  const settings  = collectSettings();
  _originalPrompt = prompt;
  _lastSettings   = settings;
  setGenerating(true);

  try {
    const res  = await fetch(`${API_BASE}/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, settings }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
    _projectId = data.project_id;
    showProgressSection();
    startPolling(_projectId);
  } catch (err) {
    setGenerating(false);
    showError(err.message);
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────

function startPolling(projectId) {
  stopPolling();
  _pollTimer = setInterval(() => pollStatus(projectId), POLL_MS);
  pollStatus(projectId);
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

async function pollStatus(projectId) {
  try {
    const res  = await fetch(`${API_BASE}/status/${projectId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Status fetch failed');
    updateProgress(data);
    if (data.status === 'completed') {
      stopPolling(); _stopWaitMessages(); showResult(projectId);
    } else if (data.status === 'failed') {
      stopPolling(); _stopWaitMessages();
      showErrorSection(data.error || 'An unknown error occurred during generation.');
    }
  } catch (err) {
    console.error('Poll error:', err);
  }
}

// ── Progress UI ───────────────────────────────────────────────────────────────

function updateProgress(data) {
  const pct  = Math.min(100, Math.max(0, data.progress || 0));
  const step = data.current_step || '';

  document.getElementById('progressBar').style.width = `${pct}%`;
  document.getElementById('progressPct').textContent = `${pct}%`;

  const stepIdx = STEP_ORDER.indexOf(step);
  STEP_ORDER.forEach((s, i) => {
    const el = document.querySelector(`.step[data-step="${s}"]`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < stepIdx)        el.classList.add('done');
    else if (i === stepIdx) el.classList.add('active');
  });

  if (step && step !== _currentStepKey && step !== 'completed') _startWaitMessages(step);

  const detailEl = document.getElementById('stepDetail');
  if (detailEl && data.step_detail) {
    _stopWaitMessages();
    _currentStepKey = step;
    detailEl.textContent = data.step_detail;
  }

  if (data.script) {
    document.getElementById('scriptPreview').classList.remove('hidden');
    document.getElementById('scriptText').textContent = data.script;
  }

  if (data.scenes && data.scenes.length > 0) renderScenes(data.scenes);
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

// ── Show / hide sections ──────────────────────────────────────────────────────

function showProgressSection() {
  document.getElementById('heroSection').classList.add('hidden');
  document.getElementById('inputSection').classList.add('hidden');
  document.getElementById('progressSection').classList.remove('hidden');
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('errorSection').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showResult(projectId) {
  document.getElementById('progressSection').classList.add('hidden');
  const rs = document.getElementById('resultSection');
  rs.classList.remove('hidden');

  document.getElementById('videoPlayer').src = `${API_BASE}/video/${projectId}`;
  document.getElementById('downloadBtn').href = `${API_BASE}/video/${projectId}?download=true`;

  const remakeInput = document.getElementById('remakePromptInput');
  if (remakeInput) {
    remakeInput.value = _originalPrompt;
    document.getElementById('remakeCharCount').textContent = _originalPrompt.length;
  }
  _syncRemakeSettings(_lastSettings);
  rs.scrollIntoView({ behavior: 'smooth' });
}

function showErrorSection(detail) {
  document.getElementById('progressSection').classList.add('hidden');
  document.getElementById('errorSection').classList.remove('hidden');
  document.getElementById('errorDetail').textContent = detail;
}

function resetUI() {
  stopPolling();
  _stopWaitMessages();
  _currentStepKey = '';
  _projectId      = null;

  document.getElementById('heroSection').classList.remove('hidden');
  document.getElementById('inputSection').classList.remove('hidden');
  document.getElementById('progressSection').classList.add('hidden');
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('errorSection').classList.add('hidden');

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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function confirmBack() {
  if (confirm('Cancel the current generation and go back?')) {
    stopPolling();
    _stopWaitMessages();
    resetUI();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setGenerating(active) {
  const btn = document.getElementById('generateBtn');
  btn.disabled = active;
  if (active) {
    btn.innerHTML = `
      <svg class="btn-icon-svg spin-anim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Generating…
      <span class="btn-shine"></span>`;
  } else {
    btn.innerHTML = `
      <svg class="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>
      Generate Video
      <span class="btn-shine"></span>`;
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() { document.getElementById('errorMsg').classList.add('hidden'); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Example prompts ───────────────────────────────────────────────────────────

document.querySelectorAll('.example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('promptInput');
    input.value = btn.dataset.prompt;
    updateCharCount();
    input.focus();
  });
});

function updateCharCount() {
  document.getElementById('charCount').textContent =
    document.getElementById('promptInput').value.length;
}
document.getElementById('promptInput').addEventListener('input', updateCharCount);
document.getElementById('promptInput').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') startGeneration();
});

// ── Navigation ────────────────────────────────────────────────────────────────

function showStudio() {
  document.getElementById('studioView').classList.remove('hidden');
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('navStudio').classList.add('nav-btn-active');
  document.getElementById('navDashboard').classList.remove('nav-btn-active');
}

function showDashboard() {
  const inProgress = _projectId && !document.getElementById('progressSection').classList.contains('hidden');
  if (inProgress && !confirm('A generation is in progress. Switch to dashboard anyway?')) return;
  document.getElementById('studioView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  document.getElementById('navDashboard').classList.add('nav-btn-active');
  document.getElementById('navStudio').classList.remove('nav-btn-active');
  loadDashboard();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  const grid  = document.getElementById('dashboardGrid');
  const stats = document.getElementById('dashboardStats');
  grid.innerHTML  = '<div class="dash-loading">Loading your videos…</div>';
  stats.innerHTML = '';

  try {
    const res      = await fetch(`${API_BASE}/projects?limit=50`);
    const data     = await res.json();
    const projects = data.projects || [];

    const total     = projects.length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const failed    = projects.filter(p => p.status === 'failed').length;
    const running   = projects.filter(p => p.status === 'processing' || p.status === 'queued').length;

    stats.innerHTML = `
      <div class="dash-stat"><span class="dash-stat-val">${total}</span><span class="dash-stat-label">Total</span></div>
      <div class="dash-stat dash-stat-green"><span class="dash-stat-val">${completed}</span><span class="dash-stat-label">Completed</span></div>
      <div class="dash-stat dash-stat-cyan"><span class="dash-stat-val">${running}</span><span class="dash-stat-label">In Progress</span></div>
      <div class="dash-stat dash-stat-red"><span class="dash-stat-val">${failed}</span><span class="dash-stat-label">Failed</span></div>
    `;

    if (!projects.length) {
      grid.innerHTML = '<div class="dash-empty">No videos yet — generate your first one in Studio!</div>';
      return;
    }
    grid.innerHTML = '';
    projects.forEach(p => grid.appendChild(_makeDashCard(p)));
  } catch (err) {
    grid.innerHTML = `<div class="dash-empty">Failed to load projects: ${escapeHtml(err.message)}</div>`;
  }
}

function _makeDashCard(p) {
  const card = document.createElement('div');
  card.className = 'dash-card';

  const statusClass = p.status === 'completed' ? 'status-done'
                    : p.status === 'failed'     ? 'status-fail'
                    :                             'status-run';
  const statusLabel = p.status === 'completed' ? 'Completed'
                    : p.status === 'failed'     ? 'Failed'
                    : p.status === 'processing' ? 'Processing…'
                    :                             'Queued';

  const promptPreview = (p.prompt || '').slice(0, 110) + ((p.prompt || '').length > 110 ? '…' : '');
  const date = p.created_at
    ? new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const s    = p.settings || {};
  const meta = [s.duration ? `${s.duration}s` : '', s.language || '', s.tone || '', s.aspect_ratio || '']
    .filter(Boolean).join(' · ');

  const settingsJson = escapeHtml(JSON.stringify(p.settings || {}));
  const promptEsc    = escapeHtml(p.prompt || '');

  const thumbHtml = p.has_video
    ? `<div class="dash-thumb" onclick="playDashVideo('${p.project_id}', this)">
         <img src="${API_BASE}/thumbnail/${p.project_id}" alt="" loading="lazy"
              onerror="this.parentNode.innerHTML='<div class=dash-thumb-ph>▶</div>'" />
         <div class="dash-play-icon">▶</div>
       </div>`
    : `<div class="dash-thumb-ph">${p.status === 'processing' ? '⏳' : p.status === 'failed' ? '✕' : '?'}</div>`;

  const dlBtn = p.has_video
    ? `<a class="btn btn-sm btn-primary" href="${API_BASE}/video/${p.project_id}?download=true" download>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
         Download
       </a>` : '';

  card.innerHTML = `
    ${thumbHtml}
    <div class="dash-card-body">
      <div class="dash-card-top">
        <span class="dash-status ${statusClass}">${statusLabel}</span>
        <span class="dash-date">${escapeHtml(date)}</span>
      </div>
      <p class="dash-prompt">${escapeHtml(promptPreview)}</p>
      <p class="dash-meta">${escapeHtml(meta)}</p>
      <div class="dash-actions">
        ${dlBtn}
        <button class="btn btn-sm btn-secondary"
          onclick='remakeFromDash(${JSON.stringify(p.prompt || "")}, ${JSON.stringify(p.settings || {})})'>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
          Remake
        </button>
      </div>
    </div>
  `;
  return card;
}

function playDashVideo(projectId, thumbEl) {
  const video    = document.createElement('video');
  video.src      = `${API_BASE}/video/${projectId}`;
  video.controls = true;
  video.autoplay = true;
  video.className = 'dash-inline-video';
  thumbEl.replaceWith(video);
}

function remakeFromDash(prompt, settings) {
  showStudio();
  document.getElementById('promptInput').value = prompt;
  updateCharCount();
  _originalPrompt = prompt;
  _lastSettings   = settings || {};
  if (settings) {
    if (settings.duration)     setSegValue('durationSeg', String(settings.duration));
    if (settings.tone)         setSegValue('toneSeg',     settings.tone);
    if (settings.image_style)  setSegValue('styleSeg',    settings.image_style);
    if (settings.aspect_ratio) setSegValue('ratioSeg',    settings.aspect_ratio);
    if (settings.language)     setSegValue('languageSeg', settings.language);
    if (settings.voice_gender) setSegValue('voiceSeg',    settings.voice_gender);
    setSegValue('musicSeg', String(settings.include_music !== false));
  }
  const body  = document.getElementById('settingsBody');
  const arrow = document.getElementById('settingsArrow');
  if (!body.classList.contains('open')) { body.classList.add('open'); arrow.classList.add('open'); }
  setTimeout(() => document.getElementById('promptInput').scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
}

// ── Edit & Remake (result section) ────────────────────────────────────────────

function toggleRemake() {
  const body  = document.getElementById('remakeBody');
  const arrow = document.getElementById('remakeArrow');
  const open  = body.classList.toggle('open');
  arrow.classList.toggle('open', open);
  if (open) {
    setTimeout(() => {
      document.getElementById('remakeToggle').closest('.remake-panel')
        .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }
}

function _syncRemakeSettings(s) {
  if (!s) return;
  const map = {
    remakeDurationSeg: String(s.duration || '60'),
    remakeToneSeg:     s.tone         || 'educational',
    remakeStyleSeg:    s.image_style  || 'photorealistic',
    remakeRatioSeg:    s.aspect_ratio || '16:9',
    remakeLanguageSeg: s.language     || 'en',
    remakeMusicSeg:    String(s.include_music !== false),
  };
  Object.entries(map).forEach(([id, val]) => setSegValue(id, val));
}

function _collectRemakeSettings() {
  return {
    duration:      parseInt(getSegValue('remakeDurationSeg') || '60', 10),
    tone:          getSegValue('remakeToneSeg')               || 'educational',
    image_style:   getSegValue('remakeStyleSeg')             || 'photorealistic',
    aspect_ratio:  getSegValue('remakeRatioSeg')             || '16:9',
    voice_gender:  getSegValue('voiceSeg')                   || 'auto',
    include_music: getSegValue('remakeMusicSeg')             === 'true',
    language:      getSegValue('remakeLanguageSeg')          || 'en',
  };
}

async function startRemake() {
  const remakeInput = document.getElementById('remakePromptInput');
  const prompt      = remakeInput ? remakeInput.value.trim() : '';
  if (!prompt || prompt.length < 10) {
    alert('Please enter a valid prompt (at least 10 characters).');
    return;
  }

  const remakeSettings = _collectRemakeSettings();
  _lastSettings        = remakeSettings;
  _originalPrompt      = prompt;

  stopPolling();
  _stopWaitMessages();
  _projectId = null;
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressPct').textContent  = '0%';
  document.getElementById('scriptPreview').classList.add('hidden');
  document.getElementById('scenesPreview').classList.add('hidden');
  document.getElementById('scenesGrid').innerHTML = '';
  STEP_ORDER.forEach(s => {
    const el = document.querySelector(`.step[data-step="${s}"]`);
    if (el) el.classList.remove('active', 'done');
  });
  clearError();
  setGenerating(true);

  try {
    const res  = await fetch(`${API_BASE}/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, settings: remakeSettings }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
    _projectId = data.project_id;
    showProgressSection();
    startPolling(_projectId);
  } catch (err) {
    setGenerating(false);
    document.getElementById('resultSection').classList.remove('hidden');
    alert('Remake failed: ' + err.message);
  }
}

document.getElementById('remakePromptInput')?.addEventListener('input', () => {
  document.getElementById('remakeCharCount').textContent =
    document.getElementById('remakePromptInput').value.length;
});

// ── Default view: Dashboard on first load ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  showDashboard();
});

// Spin keyframe is defined in style.css (.spin-anim)
