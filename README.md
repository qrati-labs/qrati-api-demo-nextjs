# Qrati API demo (Next.js)

A reference Next.js (App Router) app that calls the Qrati public REST API (`/v1`) with plain `fetch`, no SDK. Use it to see every API call in a working app, or as a starting point for your own integration.

- API docs: https://api.qrati.com/docs
- OpenAPI spec: https://api.qrati.com/v1/openapi.json
- Developer page: https://qrati.com/developers
- TypeScript SDK: [`@qratilabs/qrati-sdk`](https://www.npmjs.com/package/@qratilabs/qrati-sdk)

The organization's secret key stays on the server. The browser talks only to Server Actions and one stream proxy, and uploads files straight to storage with presigned URLs.

> **Demo only.** Anyone who can sign up to this app can act through your API key. Do not deploy it publicly with a production key.

## Prerequisites

- Node.js 20.9+ and [pnpm](https://pnpm.io)
- A Qrati organization with at least one event, created in the Qrati dashboard (the API cannot create events).
- A **secret** API key with `write` scope, created in the dashboard under organization settings → API Keys.
- A MongoDB instance. The demo uses it only for its own sign-in (Better Auth), not for Qrati data.

## Setup

```bash
cp .env.example .env.local   # then fill in the values below
pnpm install
pnpm dev                     # http://localhost:3010
```

| Variable | Purpose |
|---|---|
| `QRATI_API_KEY` | Qrati secret key. Server-only: never prefix it with `NEXT_PUBLIC_`. |
| `QRATI_BASE_URL` | API base URL, default `https://api.qrati.com/v1`. |
| `MONGODB_URI` | MongoDB for the demo's own sign-in. |
| `BETTER_AUTH_SECRET` | Session secret. Generate one with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | The app's own URL, `http://localhost:3010` locally. |

Register an account on the login page, then open an event. Each signed-in demo user is sent to Qrati as an end user (`x-qrati-uid` plus name headers).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Run, build, serve (port 3010) |
| `pnpm test` | Unit and component tests (vitest, no network or API key needed) |
| `pnpm vitest run --coverage` | Same, with a coverage report |
| `pnpm lint` | ESLint |

## What it demonstrates

Every public route on the API docs is wrapped in `app/actions/qrati.ts`.

| Area | Endpoints | Where in the demo |
|---|---|---|
| Health | `GET /health`, `GET /ready` (API root, not `/v1`) | dashboard header |
| Organization | `GET /v1/organization`, `GET /v1/folders`, `GET /v1/folders/{id}` | dashboard |
| Events | list/search, detail, stats, leaderboard, upload-count, points, live stream (`GET /v1/events/{id}/stream`) | dashboard, event tabs |
| Content | list/search/by ids, detail, count, mine, soft delete, reaction | gallery, My uploads |
| Uploads | create, presigned `PUT`, complete, fail, abort, `GET /v1/uploads/status` | Upload tab |
| Curation | queue, eligibility, rating | Curate tab (contest events) |
| Moderation | `GET /v1/moderation/queue`, `PATCH /v1/content/{id}/moderation` | `/dashboard/moderation` |

Worth copying:

- **Key handling:** `lib/qrati.ts` is the only place the key is read. It also maps problem+json errors to `QratiApiError` with `status` and `code`.
- **Upload recovery:** uploads send a `clientUploadId`, so `/uploads/status` can find an upload whose create response was lost.
- **Live updates:** `app/api/events/[eventId]/stream/route.ts` proxies the SSE stream so the browser never sees the key. Approvals add an item; `content.removed` removes one.
- **Metadata filter:** the moderation page's filter box takes a JSON object, sent as `?metadata=`. It matches the `metadata` key-values attached at upload (for example `{"businessId":"b-42"}`); uploads made through this demo carry none.

### Engagement styles

An event has exactly one style, and the UI follows it (the API itself does not enforce it):

| Style | What attendees do | In the demo |
|---|---|---|
| `SIMPLE` | Upload and browse | Gallery, Upload, My uploads, Leaderboard |
| `REACTION` | React with the event's own `reactionEmojis` | Reaction buttons in the content modal |
| `CONTEST` | Rate content (curation) | Curate tab and curation links |

`reactionEmojis` are short strings the event owner chooses (emoji or words). The API rejects any other value, so the demo shows exactly what `GET /v1/events/{id}` returns.

### Search

- `GET /v1/content?q=` is keyword search over captions and AI descriptions, across the organization. The gallery search box uses it.
- `GET /v1/content?keywords=` filters one event's gallery by AI descriptions. `listContent` supports it; there is no UI for it.
- Facial search is not available in the API.

## What is not in the API

The API moves content through events and organizations that already exist. It does not create or configure them. These are done in the Qrati dashboard and have no `/v1` endpoint:

- Event creation, editing, deletion, folders and cover images
- Event settings: visibility, status, engagement style, reactions, language, points, theme, rating parameters, admins and access
- Moderation settings (auto-approve policy, NSFW/AI checks, duplicates), bulk review and re-evaluation
- Analytics dashboards (the API exposes only event stats, leaderboard and points)
- Ad management (event ads, ad-server sync, ad analytics)
- Organization settings: API keys, webhooks, storage, branding, AI/face settings, identity verification and roles

The full map is the comment at the top of `app/actions/qrati.ts`.

## Project layout

```
app/actions/qrati.ts      Server Actions: one wrapper per API route, plus the scope map
app/api/events/.../stream SSE proxy
app/dashboard/            events, gallery, upload, curate, leaderboard, moderation
components/               upload form, gallery grid, content modal
lib/qrati.ts              fetch client, identity headers, QratiApiError
lib/engagement.ts         engagement-style helpers (SIMPLE / REACTION / CONTEST)
lib/types.ts              response shapes the UI uses
proxy.ts                  redirects signed-out users to /login
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| App fails at startup with "QRATI_API_KEY is not set" | Missing `.env.local`. |
| `401` | Wrong or revoked key. |
| `403` on moderation, or `cross_org_access` | The key is publishable, lacks `write` scope, or belongs to another organization. |
| `409 conflict` on a moderation decision | Someone decided at the same moment. Reload the item and retry. |
| `409 content_not_ready` | The upload is still processing. Retry shortly. |
| `429` | Rate limited. Wait and retry. |
| Upload fails with "Failed to fetch" | The browser's `PUT` to storage was blocked: the bucket's CORS rules must allow your app origin and the `PUT` method. |
| Reaction error "Reaction is not one of the event's configured reactionEmojis" | The event is not a `REACTION` event, or the value is not in its list. |
| Empty event list | The organization has no events. Create one in the dashboard. |

## License

[MIT](LICENSE)
