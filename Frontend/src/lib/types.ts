/** Shapes returned by the Flask backend. Mirrors the real payloads. */

export type Tone = 'educational' | 'professional' | 'motivational' | 'casual' | 'entertaining'
export type ImageStyle = 'photorealistic' | 'cinematic' | 'documentary'
export type AspectRatio = '16:9' | '9:16' | '1:1'
export type VoiceGender = 'auto' | 'female' | 'male'
export type LanguageCode =
  | 'en' | 'hi' | 'bn' | 'te' | 'mr' | 'ta' | 'gu' | 'kn' | 'ml' | 'pa' | 'or' | 'as'
export type Platform =
  | '' | 'youtube' | 'youtube_shorts' | 'tiktok' | 'instagram_reels'
  | 'instagram_post' | 'linkedin' | 'twitter'
export type Plan = 'free' | 'starter' | 'pro' | 'enterprise'
export type Role = 'user' | 'admin' | 'super_admin'

/** Exact keys emitted by services/pipeline_manager.py `_set_stage`. */
export type PipelineStep =
  | 'analyzing_prompt' | 'generating_script' | 'planning_scenes'
  | 'generating_images' | 'generating_clips' | 'generating_voices'
  | 'generating_music' | 'assembling_video' | 'completed'

export type Status = 'queued' | 'processing' | 'completed' | 'failed'

export interface Settings {
  duration: number
  tone: Tone
  image_style: ImageStyle
  aspect_ratio: AspectRatio
  voice_gender: VoiceGender
  include_music: boolean
  platform: Platform
  language: LanguageCode
  scene_count?: number
}

export interface Scene {
  scene_number: number
  narration: string
  visual_prompt?: string
  duration: number
}

export interface ProjectStatus {
  project_id: string
  status: Status
  current_step: PipelineStep | string
  progress: number
  step_detail: string
  script: string | null
  scenes: Scene[]
  error: string | null
  prompt: string
  settings: Partial<Settings>
  created_at: string | null
}

export interface Project {
  project_id: string
  prompt: string
  status: Status
  progress: number
  settings: Partial<Settings>
  created_at: string | null
  updated_at?: string | null
  has_video?: boolean
  language?: string
}

export interface GenerateResponse {
  project_id: string
  status: string
}

export interface Quota {
  used: number
  limit: number
  remaining: number
}

/** GET /api/user/me */
export interface UserMe {
  user_id: string
  name: string
  email: string
  avatar: string | null
  plan: Plan
  role: Role
  quota: Quota
  has_google: boolean
  has_password: boolean
}

/** GET /api/auth/me — the whole user doc minus password_hash/_id. */
export interface AuthMe {
  user_id: string
  name: string
  email: string
  avatar: string | null
  plan: Plan
  role: Role
  permissions: string[]
  is_admin: boolean
  is_active: boolean
  is_super_admin: boolean
  all_permissions: string[]
  current_session_id: string
  created_at: string | null
  last_login: string | null
  total_videos_generated: number
  videos_this_month: number
  google_id?: string
}

export interface SessionRow {
  session_id: string
  user_id: string
  ip: string
  device: string
  browser: string
  os: string
  remember?: boolean
  created_at: string
  expires_at: string
  last_active: string
  is_active: boolean
  is_current?: boolean
}

export interface LoginHistoryRow {
  user_id: string
  email: string
  action: string
  success: boolean
  ip: string
  device: string
  browser: string
  os: string
  failure_reason: string
  created_at: string
}

export interface AdminUser {
  user_id: string
  name: string
  email: string
  plan: Plan
  role: Role
  permissions?: string[]
  is_admin: boolean
  is_active: boolean
  created_at: string | null
  last_login: string | null
  total_videos_generated: number
  videos_this_month: number
}

export interface AdminStats {
  total_users: number
  active_users: number
  pro_users: number
  new_today: number
  new_this_week: number
  total_videos: number
  active_sessions: number
  failed_logins_today: number
  signup_trend: { date: string; count: number }[]
  total_projects: number
  completed_projects: number
  failed_projects: number
  processing_projects: number
  recent_users: AdminUser[]
  recent_projects: Project[]
}

export interface AdminHealth {
  mongodb: string
  ollama: string
  /** "ok" | "degraded" | "error" — degraded means queued jobs but no worker. */
  queue?: string
  queue_detail?: string
  queue_backend?: string
  queue_depth?: number
  queue_workers?: number
}

/** Admin list endpoints share this envelope; K names the data key. */
export type Paginated<T, K extends string> = {
  total: number
  page: number
  limit?: number
  pages: number
} & { [P in K]: T[] }
