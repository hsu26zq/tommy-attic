# Tommy's Attic

My notes: a private Notion-style notebook only I can edit. Any page can be published to the web.

## How it fits together

```
You (browser + BlockNote editor)
   ↓
Vercel   – the website (frontend/, Next.js + BlockNote)
   ↓  /api/*
Render   – the API (backend/, Hono): saves notes, checks login, trusted devices, alerts
   ↓
Supabase – notes, login (passkeys), trusted devices, files
```

| Folder | What | Runs on |
|---|---|---|
| `frontend/` | Website + editor | Vercel |
| `backend/` | API | Render (Docker) |
| `database/migrations/` | Tables + security rules (run in order) | Supabase |

## Security

1. **Login:** scan a QR code with your iPhone and approve with Face ID (on the iPhone itself: Face ID directly).
2. **Backend:** every write is checked against the owner account.
3. **Database:** Row Level Security. Visitors can only read notes marked public.

Trusted devices stay logged in. A device is trusted only by setting `approved = true` in the
Supabase `devices` table. Other devices get a short session (logged out when the browser closes or
after 30 minutes idle). Every login sends an alert email.

## Features

Nested pages, search (⌘K), trash, version history, `@` links + backlinks, databases (table view),
Notion import, live sync between devices, drawing (Apple Pencil), PDF reader, code highlighting.

## Run it locally

```bash
cp .env.example .env      # fill in your Supabase URL + publishable key
docker compose up --build
# open http://localhost:3000
```

Without Docker: `cd backend && npm i && npm run dev`, then `cd frontend && npm i && npm run dev`.

## Environment variables

| Where | Variable |
|---|---|
| Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `API_URL` (Render URL), `NEXT_PUBLIC_COLLAB_URL` (Render `wss://` URL) |
| Render | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (QR login), `RESEND_API_KEY` + `ALERT_EMAIL` (login emails) |

## Licenses

The editor uses BlockNote (MPL-2.0) and `@blocknote/xl-multi-column` (GPL-3.0), which is why this
repository is public. The notes themselves live in the database, not in this code.
