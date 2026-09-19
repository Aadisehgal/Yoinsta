# Yoinsta — Build Order Step 1

**Scope of this step:** project scaffold + full Prisma schema + auth (matches spec section 12,
step 1: "Project scaffold + Prisma schema + auth").

## What's included

- Next.js 14 App Router + TypeScript + Tailwind, configured per section 2 (fixed tech stack)
- Full Prisma schema — every model from sections 5 and 7, unchanged, plus the relation fields
  Prisma needs to compile them (the spec's snippets didn't include `@relation` back-references)
- Google login via NextAuth, JWT sessions (no database session table, per "JWT sessions" in the spec)
- Admin whitelist logic: role is decided **only** from `ADMIN_EMAILS` on every login, never
  anywhere else (section 6, rules 1–2)
- Admin PIN flow (section 6, rule 3): `/admin/pin` → `/api/admin/verify-pin` → session updated →
  middleware + admin layout both re-check role and PIN (rule 6)
- `AdminLog` writes on PIN success/failure (rule 5)
- AES-256-GCM helpers in `lib/encryption.ts` for API keys / OAuth tokens (section 4), plus a
  SHA-256 helper for the access code hash (section 5)
- Redis client + a `cached()` helper ready for the YouTube quota-saving cache layer (section 10)
- Dashboard shell (sidebar + topbar) and an empty-state dashboard home, login page, landing page,
  admin shell — styled per section 9 (dark by default, no blank empty states)

## Assumptions made (spec said "make sensible decisions" where unstated)

1. **Login method:** built Google OAuth only for this step. The spec says "Email/Google login"
   but the env var list (section 11) only has Google credentials, no SMTP/email-provider vars.
   Add an `Email` NextAuth provider (or credentials + bcrypt) later once you tell me which you want
   — magic-link email needs an SMTP or Resend/Postmark key that isn't in the fixed env list yet.
2. **Admin PIN storage:** rather than a DB flag alone, `adminPinOk` lives in the JWT for that
   session (so it naturally resets on every fresh login, matching "asked on each admin session").
   The `User.adminPinOk` column from the schema is still there if you'd rather persist it — not
   currently written to, flagging this so it's not silently unused.
3. **New-device OTP (section 6, rule 4):** not built yet — it needs an email-sending service
   (Resend/SES/SMTP) which isn't in the fixed env list. Left as a clear gap rather than guessing
   a provider; tell me which one and I'll wire it into the PIN flow.
4. Feature pages (Keywords, SEO Tools, Competitors, AI Tools, Instagram, Settings) are just nav
   links right now — they 404 until we build them in later steps.

## Setup (run this yourself — this environment has no network access to do it for you)

```bash
npm install
cp .env.example .env        # fill in every value
npx prisma migrate dev --name init
npm run dev
```

Generate `NEXTAUTH_SECRET` and `ENCRYPTION_KEY` with:
```bash
openssl rand -base64 32
```

You'll need a Google Cloud OAuth client (Web application) with
`http://localhost:3000/api/auth/callback/google` as an authorized redirect URI, and a local or
hosted Postgres + Redis instance for `DATABASE_URL` / `REDIS_URL`.

## Build Order Step 2 — done

- `ai/router.ts` + `ai/providers/{groq,gemini,openai,claude}.ts` + `ai/prompts.ts` — the unified
  module from spec section 4, all rules followed: server-side only, AES-256 decrypt at call time,
  20s timeout, same `{ success, content, provider, error? }` shape back, never logs key material.
- `/api/keys` (GET list masked + POST save-and-auto-test), `/api/keys/test` (re-test),
  `/api/keys/:id` (DELETE) — matches section 8.
- `/api/ai/generate` — runs a feature prompt (`titles` implemented; `description`/`tags`/`hooks`
  templates exist in `ai/prompts.ts`, wire up more UI as those features get built).
- Settings page (BYOK panel) and an AI Tools page (title generator) — end-to-end proof of
  "add a key → get AI title suggestions" (first acceptance criterion in section 13).

## Monetization pivot — subscriptions → rewarded ads

Decided in chat: no more FREE/PRO/CREATOR tiers, no Razorpay. Every feature is free for every
signed-in user; platform-side analysis actions (SEO score, keyword research, channel refresh —
anything that spends a YouTube API call) are gated one-per-resource behind a rewarded ad. The
Master Access Code now grants permanent **ad-free** status instead of a paid plan.

What changed:
- `razorpay` removed from `package.json`; `RAZORPAY_*` removed from `.env.example`
- `User.plan` / `planExpiresAt` → `User.adFree Boolean`
- `AccessCode.planType` removed — a code has one effect now: ad-free
- New `AdUnlock` model + `lib/ads.ts` + `/api/ads/{start,complete,status}` + `<AdGate>` component
  (`components/ad-gate.tsx`) — wrap any per-resource content in it and it handles the
  check → ad → unlock flow
- AI generation (`/api/ai/generate`) is **not** ad-gated — it runs on the user's own key, so it
  costs Yoinsta nothing either way. The ad-gate applies to platform-side analysis instead.

**Still a placeholder:** `<AdGate>` plays a 5-second mock "ad" (just a countdown) instead of a
real network's rewarded ad unit — no ad network account exists yet in this environment. Swap
`runMockAd()` in `components/ad-gate.tsx` for the real SDK's "show rewarded ad" call once you've
picked a network (Google Ad Manager, Unity Ads, Adsterra, etc. — Ad Manager usually needs a
minimum-traffic approval, worth checking before committing to one). The bigger thing to do at
that point: verify the network's **server-to-server reward postback**, not just the client's
"reward earned" event — right now `completeAdUnlock()` only checks a single-use nonce, which
stops casual replay but not someone who skips calling the SDK's ad entirely.

## Build Order Step 3 — done

- `lib/youtube.ts` — OAuth URL builder, token exchange/refresh, and raw-fetch wrappers for
  channels.list, playlistItems.list + videos.list, and the YouTube Analytics v2 report (no
  `googleapis` SDK needed, keeps the dependency list lean).
- `/api/youtube/connect` + `/api/youtube/callback` — full OAuth flow with a signed state cookie
  (CSRF protection), `access_type=offline&prompt=consent` so a refresh token is always issued,
  encrypted refresh token stored on `Channel.accessTokenEnc`.
- `/api/youtube/dashboard` (15 min Redis cache) and `/api/youtube/videos` (1 hour cache) — matches
  section 10's cache windows exactly. Cache misses go through `lib/rate-limit.ts`, a flat daily
  quota (replaces the old FREE/PRO split — see the monetization pivot above).
- `/api/youtube/status` + `/api/youtube/disconnect` — connection state and disconnect, wired into
  the Settings page's new "Connected accounts" card.
- Real dashboard UI: subscriber/views/watch-time/video-count stat cards, a Recharts line chart of
  daily views (28d), and a top-videos list, with a skeleton loading state and an empty state that
  links straight to `/api/youtube/connect`.

**One scoping note:** "top videos" here is all-time views across the uploads playlist, not
strictly windowed to 28 days — a true 28-day top-videos view needs the Analytics API queried with
a `video` dimension instead of Data API v3 stats. Flagging it rather than quietly approximating;
easy to add if you want it exact.

### Setting up Google Cloud for this step

1. In Google Cloud Console, enable **YouTube Data API v3** and **YouTube Analytics API**.
2. Create an OAuth 2.0 Client ID (Web application). You can reuse the same client for both
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (login) and `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`
   (channel connect) if you'd rather manage one client — just add both redirect URIs to it:
   - `{NEXTAUTH_URL}/api/auth/callback/google`
   - `{NEXTAUTH_URL}/api/youtube/callback`
3. `youtube.readonly` and `yt-analytics.readonly` are **sensitive scopes**. While the OAuth consent
   screen is in "Testing" mode you can add up to 100 test-user emails and everything works; to let
   anyone connect their channel you'll eventually need Google's OAuth verification review — worth
   starting that early, it isn't instant.
4. A new Cloud project gets a default shared quota (commonly 10,000 units/day) — `channels.list`,
   `playlistItems.list`, and `videos.list` each cost ~1 unit per call, so the Redis caching here
   is doing real work, not just a nice-to-have.

## Build Order Step 4 — done

- `lib/seo-score.ts` — deterministic (no AI) scorer: title (length, numbers, power words, caps ratio),
  description (length, timestamps, links, hashtags), tags (count, character budget, long-tail mix).
  Same input always gives the same score, and every deduction comes with a specific tip.
- `/api/youtube/seo-score` — paste any public video URL, get a 0–100 score + breakdown. 1h cache,
  1 quota unit per lookup (videos.list). Ad-gated per video ID — matches the "one ad per video"
  model from the pivot.
- `/api/youtube/keywords` — autocomplete-based keyword suggestions (free, no quota — Google's public
  suggest endpoint) plus a **heuristic** competition/opportunity score from the topic's top 10
  ranking videos (avg views + channel concentration). 24h cache (per spec) and a strict 5/day quota
  on top of that, because the underlying `search.list` call costs **100 quota units** — by far the
  most expensive call in the app. Ad-gated per topic.
- Both tools reuse the signed-in user's own connected YouTube access token (`getUserAccessToken` in
  `lib/youtube.ts`) rather than a separate API key, so there's no new Google Cloud step needed right
  now — the tradeoff is they only work once a channel is connected.

**Being upfront about the "opportunity score":** it's a heuristic built from real data (top-ranking
videos' views and channel diversity), not actual Google Trends search-volume numbers — that needs a
paid Google Ads API integration. The UI says this explicitly rather than implying more precision
than it has.

## Companion Android app

`<AdGate>` (`components/ad-gate.tsx`) now detects a native bridge (`window.AndroidAds`) and shows
a real AdMob rewarded ad when this site is opened inside the separate **yoinsta-android** WebView
wrapper project, falling back to its mock ad in a plain browser. That project is its own repo —
built with Termux/Gradle, currently wired to Google's public test AdMob IDs.

## Next step

Build Order Step 5: Admin panel (access-code generation/redemption UI) + BullMQ background jobs for
heavier YouTube data refreshes. Video Comparison (spec section 3, feature 7) is also still open —
straightforward to add on top of the video-fetch code already here.
