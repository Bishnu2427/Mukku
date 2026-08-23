# Mukku AI Studio — Security Posture

Audited against **OWASP Top 10 (2021)** and **OWASP ASVS 4.0 Level 1–2** on
**2026-08-23**. Every finding below was verified by exercising the running
application, not by reading code alone.

> **On "100% compliant":** the Top 10 is an awareness document, not a
> certifiable standard — nothing can be "100% Top 10 compliant". ASVS *is*
> verifiable, by level. This codebase now meets the ASVS L1 controls that apply
> to it and most of L2. The remaining L2/L3 gaps are listed in §3; they need
> process (pen test, threat model, key management), not code.

---

## 1. Findings fixed in this pass

| # | OWASP | Severity | Finding | Fix |
|---|---|---|---|---|
| 1 | A01 | **High** | `/thumbnail/<id>` had no ownership check. Project ids are 10 hex chars and appear in dashboard markup, so any user could pull frames from another user's video. | Routed through `_owned_project()`, the same gate as `/status` and `/video`. Now 404s. |
| 2 | A07 | **High** | Google OAuth had no `state` parameter. An attacker could complete the flow with their own `code` in a victim's browser (login CSRF / account linking). | Single-use `secrets.token_urlsafe(32)` bound to the Flask session, compared with `compare_digest`. |
| 3 | A02 | **High** | `JWT_SECRET` fell back to a hardcoded literal committed in the source. Anyone with repo access could forge a session cookie for any user, including super admin. **The deployed value contained `mukku-change-me`.** | Startup validation refuses to boot in production on a missing/short/placeholder secret. The live secret was rotated to 256 bits. |
| 4 | A05 | **High** | Rate limiting was **registered but never enforced** — limits were keyed on function qualname while resolution used the Flask endpoint name. Verified: 8 requests against a 5/min cap all returned 200. | Limiter moved to `backend/extensions.py`; views decorated at definition time. Verified: exactly 5 pass, then 429. |
| 5 | A04 | Medium | `/enquiry` was unauthenticated **and** unrate-limited, and sends email — a spam relay. | Capped at 5/min. |
| 6 | A09 | Medium | Full Python tracebacks were stored in `project.error` and returned by `/status` to the browser, leaking absolute paths, module names and package versions. | Traceback goes to the server log and an `error_internal` field the API never serialises. Users get a stage name and an error class. |
| 7 | A09 | Medium | `admin_api._client_ip()` trusted `X-Forwarded-For` unconditionally, so an admin could forge the IP recorded against their own actions in the audit log. | Gated on `TRUST_PROXY`, matching `auth.py`. |
| 8 | A05 | Medium | CSP allowed `script-src 'unsafe-inline'` plus `cdnjs.cloudflare.com`. | The one inline script moved to `/static/theme-init.js`; three.js is bundled. CSP is now `script-src 'self'` with no third-party script origin. |
| 9 | A03 | Medium | `int(request.args.get(...))` in 15 places raised `ValueError` → HTTP 500 on any non-numeric input. `scene_count` was unbounded and reachable by API. | `safe_int(value, default, lo, hi)` everywhere; `scene_count` clamped to 0–20. |
| 10 | A06 | Medium | 21 of 22 dependencies unpinned — two builds of the same commit could install different code. | All pinned to versions verified in the production image. |
| 11 | A05 | Low | Missing `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-Permitted-Cross-Domain-Policies`; no cache directives on authenticated JSON. | All added; `/api/*` and `/status/*` now `no-store`. |
| 12 | A05 | Low | No request-size ceiling; the 50 MB per-file check ran only after the body was buffered. | `MAX_CONTENT_LENGTH` (60 MB default) rejects oversized bodies up front. |
| 13 | A04 | Low | Google-only accounts (`password_hash = None`) crashed with a 500 on password login and on change-password. | Guarded, with a message telling the user to sign in with Google. |

### Verified in the running container

```
script-src 'self'                       (no unsafe-inline, no third-party)
/thumbnail/<id> unauthenticated         404      (was 200)
/api/auth/google/callback?code=fake     302 -> /login?error=google_state
forgot-password x8 (cap 5/min)          200 x5 then 429 x3
/enquiry x7        (cap 5/min)          200 x5 then 429 x2
X-RateLimit-Limit / Remaining / Reset / Retry-After all present
weak JWT_SECRET + FLASK_DEBUG=false     RuntimeError, refuses to boot
Cache-Control on /api/*                 no-store, no-cache, must-revalidate, private
safe_int("abc"|"-99999"|"1e9"|"0x10")   clamped, never raises
```

---

## 2. Controls already in place before this audit

| Area | Control |
|---|---|
| A02 | bcrypt password hashing with per-password salt; OTPs stored as bcrypt hashes, never plaintext |
| A07 | Email 2FA on every login; OTP burns after 3 wrong attempts; 10-minute TTL |
| A07 | Brute-force lockout, 15-minute window (note: fires on the 4th attempt, not the 5th — see §3) |
| A07 | Server-side session registry — a JWT alone is not enough; sessions are revocable and TTL-indexed |
| A07 | All sessions invalidated on password change and password reset |
| A01 | RBAC with 10 granular permissions; `/admin` returns 404 (not 403) to non-admins |
| A01 | Project ownership enforced on `/status` and `/video` |
| A03 | NoSQL injection: all user input in `$regex` passes through `re.escape`, capped at 100 chars |
| A03 | Role/plan/status filter values whitelisted against fixed sets |
| A03 | XSS: React escapes by default; no `dangerouslySetInnerHTML` anywhere in the app |
| A01 | Upload hardening: extension allow-list, 50 MB cap, `secure_filename` + UUID prefix (no path traversal) |
| A09 | Login history, admin audit log, profile-change log, session registry — all persisted |
| A07 | Generic "Invalid email or password" prevents user enumeration; forgot-password always returns OK |
| A02 | Auth cookie is `httpOnly`, `SameSite=Lax`, `Secure` when `APP_URL` is https |

---

## 3. Known gaps — accepted or requiring process

These are **not** fixed. Listed honestly rather than papered over.

| # | OWASP | Issue | Why it is open |
|---|---|---|---|
| 1 | A01 | An admin holding `manage_admins` can create a second admin account with the other nine permissions and log in as it. | Inherent to delegating admin creation. Mitigate by granting `manage_admins` to the super admin only; every creation is in the audit log. |
| 2 | A04 | No CSRF tokens on state-changing requests. | `SameSite=Lax` blocks cross-site POST, which covers the realistic attack. ASVS L2 (4.2.2) wants explicit tokens — needed if you ever relax SameSite or add subdomains. |
| 3 | A07 | Lockout triggers on the **4th** failed attempt, not the 5th: the failure is written to `login_history` before `record_failed_attempt` counts it. | Off-by-one, fails safe (stricter than intended). Cosmetic. |
| 4 | A07 | Failed **registrations** count toward the login lockout — the counter filters on email + `success:false` and ignores `action`. | Lets someone lock a known email out of login by hammering `/register`. Rate limiting (5/min) blunts it. |
| 5 | A02 | Secrets live in `.env` on disk. | Fine for a single box. Use a secrets manager (Vault, AWS SM, Doppler) for multi-host. |
| 6 | A10 | `_download_file()` fetches URLs returned by Leonardo/Kling/Pollo/Suno with no allow-list. | Requires compromising a provider's API response. Add host allow-listing if you accept user-supplied media URLs later. |
| 7 | A06 | No automated CVE scanning in CI. | Add `pip-audit` and `npm audit --production` as a pipeline gate. |
| 8 | A08 | No Subresource Integrity on Google Fonts. | Google Fonts rotates URLs, so SRI is impractical. Self-host the woff2 files to close it. |
| 9 | — | No penetration test, threat model, or incident-response runbook. | Process, not code. Required for ASVS L2 sign-off. |
| 10 | A05 | `Server: gunicorn` header persists — gunicorn writes it at the WSGI layer, overriding the app. | No version is disclosed. Strip at the proxy: `proxy_hide_header Server;` |

---

## 4. Deployment checklist

```bash
# Generate a real secret — the app refuses to boot without one
python -c "import secrets; print(secrets.token_hex(32))"
```

- [ ] `JWT_SECRET` ≥ 32 chars, random, no placeholder words
- [ ] `APP_URL` is `https://…` — this is what enables `Secure` cookies, HSTS and `upgrade-insecure-requests`
- [ ] `FLASK_DEBUG=false` (with a weak secret, the app will refuse to start — that is intended)
- [ ] `TRUST_PROXY=true` **only** behind a proxy you control, otherwise IPs are spoofable
- [ ] `QUEUE_BACKEND=redis` + `RATELIMIT_STORAGE_URI` so limits are global, not per worker
- [ ] MongoDB reachable only on a private network, with auth enabled
- [ ] Reverse proxy strips `Server` and terminates TLS
- [ ] `pip-audit -r requirements.txt` and `npm audit` clean
- [ ] Rotate `JWT_SECRET` on any suspected compromise — it invalidates every session

## 5. Reporting

Email security issues to the address in `SUPER_ADMIN_EMAIL`. Please do not open
a public issue.
