# Mukku Frontend Migration Contract

The old vanilla frontend is replaced by a React app in `Frontend/`.
**Backend logic unchanged** (integration-only edits listed in §9). Every feature and every API call below must exist
in the new build. This file is the acceptance checklist.

Legend: `[x]` ported & verified · deviations are listed in section 9.

---

## 0. Global / shared

| Feature | Old location | Status |
|---|---|---|
| Light/dark theme, persisted to `localStorage` key `mukku_theme` | `theme.js` | [x] |
| Time-of-day default theme (06:00–18:00 → light) | `theme.js:10` | [x] |
| Floating theme toggle on every page | `theme.js:318` | [x] |
| Logo asset `/static/mukku_logo.png` | all pages | [x] |
| Toast notifications | `dashboard.html`, `admin.html` | [x] |
| Confirm dialogs before destructive actions | `admin.html:1060` | [x] |
| Mobile responsive down to 380px | `style.css`, inline media queries | [x] |

**Cookie auth note:** `mukku_token` is `httpOnly` + `SameSite=Lax`. The React app
**must be served from the same origin as Flask** or the cookie will not be sent.
All fetches keep `credentials: 'include'`.

---

## 1. Landing — `/` (public)

| Feature | Status |
|---|---|
| Three.js particle/neural background, 120 nodes, distance-linked, mouse parallax | [x] |
| Nav bar with scroll-state change | [x] |
| Logged-in user chip in nav (`GET /api/user/me`, fails silently) | [x] |
| Hero + CTAs | [x] |
| Animated stat counters (IntersectionObserver, 1400ms) | [x] |
| How-it-works — 8 pipeline stages | [x] |
| Features grid | [x] |
| Platform presets section (7) | [x] |
| Language section with cycling chips (1200ms) | [x] |
| User-media upload section | [x] |
| Pricing: Free ₹0/3 · Starter ₹177/5 · Pro ₹577/25 · Enterprise custom | [x] |
| FAQ | [x] |
| Contact form → `POST /enquiry` | [x] |
| Footer | [x] |
| Scroll-reveal on section entry | [x] |
| 3s force-reveal safety net | **not needed** — the old code hand-rolled IntersectionObserver and needed a timeout guard. Framer Motion's `whileInView` already renders immediately when IntersectionObserver is unavailable. |
| 3D tilt on cards | [x] |
| **SEO: title, description, keywords, canonical, OG, Twitter card** | [x] |
| **SEO: 3× JSON-LD — SoftwareApplication, FAQPage, Organization** | [x] |

> SEO is the main regression risk in an SPA. Landing must keep real markup in
> the served HTML — prerender or hand-author `index.html` head.

---

## 2. Studio — `/studio`

### Composer
| Feature | Status |
|---|---|
| Prompt textarea, `maxlength=3000`, live char counter | [x] |
| Client validation: non-empty, ≥10 chars | [x] |
| Ctrl/Cmd+Enter submits | [x] |
| 3 example prompt chips that fill the textarea | [x] |
| Drag-and-drop onto composer + drop overlay | [x] |
| File picker, `accept` = jpeg/png/webp/mp4/webm/quicktime | [x] |
| Client limits: 10 files max, 50 MB each, dedupe by name+size | [x] |
| Attachment chips: image thumb via `URL.createObjectURL`, video icon, remove | [x] |
| Attach button label reflects count | [x] |

### Settings
| Feature | Status |
|---|---|
| Platform picker: Custom, YouTube, Shorts, TikTok, Reels, IG Post, LinkedIn, X | [x] |
| Platform preset auto-applies ratio + duration + tone + style | [x] |
| Duration: 30 / 60 / 90 / 120 / 180 / 300 | [x] |
| Language: en hi bn te mr ta gu kn ml pa or as | [x] |
| Advanced collapsible: Tone (5), Image Style (3), Aspect Ratio (3), Voice (3), Music (2) | [x] |

### Generation
| Feature | Status |
|---|---|
| `POST /generate` as JSON when no files, `multipart/form-data` when files | [x] |
| 401 → redirect `/login` | [x] |
| 402 `quota_exceeded` → inline upgrade message | [x] |
| Poll `GET /status/{id}` every 3000ms | [x] |
| Progress bar % + step detail text | [x] |
| Rotating wait messages per stage, 5s rotation | [x] |
| 9-step tracker with done / active / pending states | [x] |
| Skeleton placeholder → script reveal → scenes grid | [x] |
| Failure → error card with detail + retry | [x] |
| Back button with "cancel?" confirm | [x] |
| Login wall shown when logged out | [x] |

### Result
| Feature | Status |
|---|---|
| Video player `GET /video/{id}` | [x] |
| Download `GET /video/{id}?download=true` | [x] |
| "Create another" resets all UI state | [x] |
| Edit & Remake panel: prompt + duration/tone/style/ratio/language/music, resubmits | [x] |

**Pipeline step keys (must match backend exactly):**
`analyzing_prompt, generating_script, planning_scenes, generating_images,
generating_clips, generating_voices, generating_music, assembling_video, completed`

---

## 3. Dashboard — `/dashboard`

| Feature | Status |
|---|---|
| Sidebar nav: Overview, My Videos (+count), Open Studio, Profile, Plan & Billing, Security | [x] |
| Sidebar user card, plan badge, quota bar, upgrade pill (hidden when not free) | [x] |
| Mobile sidebar + overlay | [x] |
| Time-based greeting (morning/afternoon/evening) | [x] |
| 4 stat cards: Total, This Month, Plan, Member Since + last login | [x] |
| Recent videos grid (6) | [x] |
| My Videos: text search + filters All/Completed/Processing/Failed | [x] |
| Project card: status chip, prompt excerpt, date, download, remake | [x] |
| Project card: delete action | **omitted** — see §9 |
| Profile: name (editable), email (disabled), `PUT /api/user/profile` | [x] |
| Change password → `POST /api/user/change-password` | [x] |
| Plan page: badge, usage bar, reset note | [x] |
| Security: active sessions, "this device" tag, revoke one, sign out all others | [x] |
| Security: login history table (time, action, device, IP, status) | [x] |
| Subscription modal + 4 pricing tiers | [x] |
| Enterprise form → `POST /enquiry` | [x] |
| Sign out → `POST /api/auth/logout` | [x] |

> **Known bug in old UI — do not reproduce:** `deleteProject()` only removed the
> DOM node; there is no delete endpoint. New UI must either hide delete or call a
> real endpoint. Flagged to owner; default = hide until backend exists.

> **Known dead link — do not reproduce:** play button pointed at
> `/video-player.html`, which never existed. Use an inline player.

---

## 4. Admin — `/admin`

| Feature | Status |
|---|---|
| Sidebar items hidden per permission; super_admin sees all | [x] |
| Non-admin → redirect `/dashboard` | [x] |
| Overview: 5 stat cards | [x] |
| Overview: 30-day signup bar chart | [x] |
| Overview: recent users + recent projects tables | [x] |
| Users: search (debounced 400ms), plan filter, pagination | [x] |
| Users: edit modal (name/plan/status), toggle active, delete w/ confirm | [x] |
| Admins: table with permission chips, create/edit modal w/ permission grid | [x] |
| Admins: `manage_admins` locked unless super_admin, warning banner | [x] |
| Admins: revoke role (disabled for self and super_admin) | [x] |
| Projects: status filter + pagination | [x] |
| Health: 4 service cards + header dot + 30s poll | [x] |
| Login History: search + pagination | [x] |
| Live Sessions: table + force sign-out + pagination | [x] |
| Audit Log: table + pagination | [x] |

**Permissions:** `view_dashboard, view_users, edit_users, delete_users,
manage_admins, view_projects, delete_projects, view_health, view_audit_log,
view_sessions`

---

## 5. Auth pages

### `/login`
| Feature | Status |
|---|---|
| Google OAuth button → `GET /api/auth/google` | [x] |
| Step 1: email + password + remember (7 days) | [x] |
| Step 2: 6-digit OTP, numeric only, **auto-submits at 6 chars** | [x] |
| Back to step 1 | [x] |
| Password visibility toggle | [x] |
| 429 lockout message surfaced | [x] |
| Handles `?error=` — google_cancelled, google_failed, account_disabled | [x] |
| Redirect target from response (`/admin` or `/dashboard`) | [x] |

### `/register`
| Feature | Status |
|---|---|
| Google OAuth | [x] |
| name / email / password | [x] |
| Strength meter (6 levels) + 4 live requirement checks | [x] |
| Rules: 8+, uppercase, digit, special — must match `auth.py:_validate_password` | [x] |
| Terms checkbox required | [x] |

### `/forgot-password`
| Feature | Status |
|---|---|
| Email → `POST /api/auth/forgot-password`, always shows success | [x] |

### `/reset-password`
| Feature | Status |
|---|---|
| Verify `?token=` via `GET /api/auth/verify-reset-token` | [x] |
| Invalid-token state | [x] |
| Password + confirm + strength → `POST /api/auth/reset-password` | [x] |
| Success state → sign in | [x] |

---

## 6. Complete API surface consumed by the frontend

Backend is **unchanged**. These 26 calls must all still work.

```
GET    /api/user/me
GET    /api/auth/me
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/verify-otp
POST   /api/auth/logout
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/verify-reset-token?token=
GET    /api/auth/google
PUT    /api/user/profile
POST   /api/user/change-password
GET    /api/user/sessions
DELETE /api/user/sessions/{sid}
POST   /api/user/sessions/logout-all
GET    /api/user/login-history?page=&limit=
POST   /generate
GET    /status/{project_id}
GET    /video/{project_id}[?download=true]
GET    /thumbnail/{project_id}
GET    /projects?limit=
POST   /enquiry
GET    /api/admin/stats
GET    /api/admin/users?page=&limit=&search=&plan=
PUT    /api/admin/users/{id}
DELETE /api/admin/users/{id}
GET    /api/admin/admins
POST   /api/admin/admins
PUT    /api/admin/admins/{id}
DELETE /api/admin/admins/{id}
GET    /api/admin/projects?page=&limit=&status=
GET    /api/admin/health
GET    /api/admin/login-history?page=&limit=&search=
GET    /api/admin/sessions?page=&limit=
DELETE /api/admin/sessions/{id}
GET    /api/admin/audit-log?page=&limit=
```

## 7. Enum values that must match the backend exactly

```
tone         educational professional motivational casual entertaining
image_style  photorealistic cinematic documentary
aspect_ratio 16:9 9:16 1:1
voice_gender auto female male
platform     "" youtube youtube_shorts tiktok instagram_reels
             instagram_post linkedin twitter
language     en hi bn te mr ta gu kn ml pa or as
duration     clamped server-side to 15..600
plans        free starter pro enterprise   (admin UI only allows free|pro)
plan limits  free 3 · starter 5 · pro 25 · enterprise -1
```

## 8. Serving model

Vite builds to `Frontend/dist`. Flask serves that directory and returns
`index.html` for unknown non-API paths so client routing works. Same origin,
so the auth cookie and CORS behaviour are unchanged.


---

## 9. Completion status — 2026-08-23

**Ported and verified.** Every row above is implemented in the React app and
was exercised against the live Flask backend on `127.0.0.1:7000`.

### Deliberate deviations

| Item | Old behaviour | New behaviour | Why |
|---|---|---|---|
| Delete project | Button removed the card from the DOM and toasted "Video removed" | Button **not rendered** | There is no delete endpoint. The old button was purely cosmetic — the project reappeared on refresh. Reinstate once `DELETE /projects/{id}` exists. |
| Play button | Linked to `/video-player.html` (a file that never existed) | Inline `<video>` in the card | The old link was dead. |
| Studio "My Videos" tab | In-page view toggled inside the studio | Link to `/dashboard` | The dashboard already owns the library; one implementation instead of two. |
| Theme toggle | Injected by `theme.js` into every page | `<ThemeToggle/>` component | Same `mukku_theme` localStorage key, so saved preferences carry over. |

### Backend changes (integration only — no logic touched)

1. `backend/app.py` — `FRONTEND_DIR` now points at `Frontend/dist`; added
   `/assets/<path>` for Vite bundles, a guarded SPA catch-all, and a 404
   handler that keeps `/api/*` returning JSON.
2. `backend/auth.py` — `_fe()` returns the SPA shell instead of a per-page HTML
   file. **All auth and RBAC logic is unchanged** — `/dashboard` still 302s to
   `/login` when signed out, `/admin` still 404s for non-admins.

Verified after the change:

```
/                      200 (SPA)      /api/user/me        401 JSON
/studio                200 (SPA)      /api/does-not-exist 404 JSON
/login                 200 (SPA)      /static/logo        200 png
/dashboard             302 -> /login  /assets/index-*.js  200
/nope                  200 (SPA 404)
```
