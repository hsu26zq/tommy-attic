# Tommy's Attic

My personal website: a blog, public notes, and a private Notion-style notebook only I can edit.

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
| `database/migrations/` | Tables + security rules | Supabase |

## Security

1. **Login:** passkeys (Face ID / Touch ID, or scan a QR code with your phone). Email link as backup.
2. **Backend:** every write is checked against the owner account.
3. **Database:** Row Level Security. Visitors can only read notes marked public.

Trusted devices stay logged in. QR login: scan with your iPhone and approve with Face ID. Every other device gets a short session (logged out when the
browser closes or after 30 minutes idle) and triggers a login alert.

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
| Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `API_URL` (the Render URL) |
| Render | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, optional `RESEND_API_KEY`, `ALERT_EMAIL` |

## Licenses

The editor uses BlockNote (MPL-2.0) and `@blocknote/xl-multi-column` (GPL-3.0), which is why this
repository is public. The notes themselves live in the database, not in this code.
