/**
 * Values that must stay in lockstep with the backend.
 * Ported verbatim from the legacy frontend/script.js and index.html so the
 * migration cannot silently drop or rename an option.
 */

import type {
  AspectRatio, ImageStyle, LanguageCode, PipelineStep, Plan, Platform, Tone, VoiceGender,
} from './types'

export const DURATIONS = [
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '90s' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
] as const

export const LANGUAGES: { value: LanguageCode; label: string; native: string }[] = [
  { value: 'en', label: 'English',   native: 'English' },
  { value: 'hi', label: 'Hindi',     native: 'हिन्दी' },
  { value: 'bn', label: 'Bengali',   native: 'বাংলা' },
  { value: 'te', label: 'Telugu',    native: 'తెలుగు' },
  { value: 'mr', label: 'Marathi',   native: 'मराठी' },
  { value: 'ta', label: 'Tamil',     native: 'தமிழ்' },
  { value: 'gu', label: 'Gujarati',  native: 'ગુજરાતી' },
  { value: 'kn', label: 'Kannada',   native: 'ಕನ್ನಡ' },
  { value: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { value: 'pa', label: 'Punjabi',   native: 'ਪੰਜਾਬੀ' },
  { value: 'or', label: 'Odia',      native: 'ଓଡ଼ିଆ' },
  { value: 'as', label: 'Assamese',  native: 'অসমীয়া' },
]

export const TONES: { value: Tone; label: string }[] = [
  { value: 'educational',  label: 'Educational' },
  { value: 'professional', label: 'Professional' },
  { value: 'motivational', label: 'Motivational' },
  { value: 'casual',       label: 'Casual' },
  { value: 'entertaining', label: 'Entertaining' },
]

export const IMAGE_STYLES: { value: ImageStyle; label: string }[] = [
  { value: 'photorealistic', label: 'Photorealistic' },
  { value: 'cinematic',      label: 'Cinematic' },
  { value: 'documentary',    label: 'Documentary' },
]

export const ASPECT_RATIOS: { value: AspectRatio; label: string; hint: string }[] = [
  { value: '16:9', label: '16:9', hint: 'Landscape' },
  { value: '9:16', label: '9:16', hint: 'Vertical' },
  { value: '1:1',  label: '1:1',  hint: 'Square' },
]

export const VOICES: { value: VoiceGender; label: string }[] = [
  { value: 'auto',   label: 'Auto' },
  { value: 'female', label: 'Female' },
  { value: 'male',   label: 'Male' },
]

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: '',                label: 'Custom' },
  { value: 'youtube',         label: 'YouTube' },
  { value: 'youtube_shorts',  label: 'Shorts' },
  { value: 'tiktok',          label: 'TikTok' },
  { value: 'instagram_reels', label: 'Reels' },
  { value: 'instagram_post',  label: 'IG Post' },
  { value: 'linkedin',        label: 'LinkedIn' },
  { value: 'twitter',         label: 'X' },
]

/** One click sets ratio + duration + tone + style. From script.js. */
export const PLATFORM_PRESETS: Record<
  string,
  { aspect_ratio: AspectRatio; duration: number; tone: Tone; image_style: ImageStyle }
> = {
  youtube:         { aspect_ratio: '16:9', duration: 120, tone: 'educational',  image_style: 'cinematic' },
  youtube_shorts:  { aspect_ratio: '9:16', duration: 60,  tone: 'entertaining', image_style: 'photorealistic' },
  tiktok:          { aspect_ratio: '9:16', duration: 60,  tone: 'entertaining', image_style: 'photorealistic' },
  instagram_reels: { aspect_ratio: '9:16', duration: 30,  tone: 'casual',       image_style: 'cinematic' },
  instagram_post:  { aspect_ratio: '1:1',  duration: 60,  tone: 'professional', image_style: 'photorealistic' },
  linkedin:        { aspect_ratio: '16:9', duration: 90,  tone: 'professional', image_style: 'documentary' },
  twitter:         { aspect_ratio: '16:9', duration: 60,  tone: 'casual',       image_style: 'photorealistic' },
}

/** Order drives the tracker's done/active/pending logic. */
export const PIPELINE_STEPS: { key: PipelineStep; name: string; desc: string }[] = [
  { key: 'analyzing_prompt',  name: 'Analyzing Prompt',   desc: 'Understanding your idea' },
  { key: 'generating_script', name: 'Writing Script',     desc: 'Generating on-topic narration' },
  { key: 'planning_scenes',   name: 'Planning Scenes',    desc: 'Breaking the script into shots' },
  { key: 'generating_images', name: 'Generating Images',  desc: 'Creating a visual per scene' },
  { key: 'generating_clips',  name: 'Animating Scenes',   desc: 'Turning stills into motion' },
  { key: 'generating_voices', name: 'Voiceover',          desc: 'Synthesising narration audio' },
  { key: 'generating_music',  name: 'Composing Music',    desc: 'Scoring a background track' },
  { key: 'assembling_video',  name: 'Assembling Video',   desc: 'Merging everything with FFmpeg' },
  { key: 'completed',         name: 'Complete',           desc: 'Your video is ready' },
]

/** Rotating reassurance while a stage runs. Ported from script.js. */
export const WAIT_MESSAGES: Record<string, string[]> = {
  analyzing_prompt: [
    'Reading your idea carefully…',
    'Understanding the story you want to tell…',
    'Extracting the essence of your topic…',
  ],
  generating_script: [
    'Writing your script — every great video starts with great words…',
    'Crafting narration that will hold attention…',
    'Turning your idea into a compelling story…',
  ],
  planning_scenes: [
    'Mapping out your visual journey…',
    'Breaking your story into cinematic moments…',
    'Designing the flow of your video…',
  ],
  generating_images: [
    'Good things take a moment.',
    'Painting your scenes, pixel by pixel…',
    'Creating visuals worth the wait…',
    'Rendering your vision into imagery…',
    'Every great visual takes a moment to perfect…',
  ],
  generating_clips: [
    'Breathing life into your stills…',
    'Animating your scenes — this is where it gets fun…',
    'Your clips are coming alive frame by frame…',
    'Turning images into cinematic motion…',
  ],
  generating_voices: [
    'Finding the right voice for your content…',
    'Synthesising narration in your chosen language…',
    'Recording your voiceover…',
  ],
  generating_music: [
    'Composing a soundtrack that fits the mood…',
    'Scoring your background music…',
    'Finding the right tune for your video…',
  ],
  assembling_video: [
    'Cutting and stitching it together…',
    'Merging clips, audio and music…',
    'Your video is taking its final shape…',
    'Adding the finishing touches…',
  ],
}

export const PLAN_LIMITS: Record<Plan | 'super_admin', number> = {
  free: 3,
  starter: 5,
  pro: 25,
  enterprise: -1,
  super_admin: -1,
}

export const PRICING = [
  { plan: 'free' as const,       price: '₹0',     period: '/mo', videos: '3 videos / mo',  popular: false },
  { plan: 'starter' as const,    price: '₹177',   period: '/mo', videos: '5 videos / mo',  popular: false },
  { plan: 'pro' as const,        price: '₹577',   period: '/mo', videos: '25 videos / mo', popular: true },
  { plan: 'enterprise' as const, price: 'Custom', period: '',    videos: 'Unlimited',      popular: false },
]

export const ADMIN_PERMISSIONS = [
  'view_dashboard', 'view_users', 'edit_users', 'delete_users', 'manage_admins',
  'view_projects', 'delete_projects', 'view_health', 'view_audit_log', 'view_sessions',
] as const

/** Client-side upload guards, matching backend limits. */
export const UPLOAD = {
  maxFiles: 10,
  maxBytes: 50 * 1024 * 1024,
  accept: 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime',
  allowedTypes: [
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
  ],
}

export const PROMPT_MAX = 3000
export const PROMPT_MIN = 10
export const POLL_MS = 3000

export const EXAMPLE_PROMPTS = [
  {
    label: 'Baby Tutorial',
    text: 'Create a tutorial on how to properly change a baby diaper for first-time parents. Cover all steps from preparation to disposal, with safety tips, in a calm and reassuring tone.',
  },
  {
    label: 'Water Benefits',
    text: 'Make an explainer video about the health benefits of drinking enough water daily. Include science-backed facts, symptoms of dehydration, and practical daily tips.',
  },
  {
    label: 'Exercise Habits',
    text: 'Create a motivational video about building consistent exercise habits. Include the science of habit formation, beginner-friendly tips, and inspiring real-world examples.',
  },
]
