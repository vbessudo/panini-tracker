# Panini 2026 Tracker

PWA mobile app to track two parallel Panini FIFA World Cup 2026 sticker albums for Simon and Paul.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (design tokens: primary `#4A1A3B`, accent `#65163D`)
- Supabase (Postgres + Realtime)
- TanStack Query + Zustand
- next-pwa + Sonner

## Setup

1. Clone this repo
2. Copy `.env.example` to `.env.local` and fill in your Supabase credentials
3. Run `npm install`
4. Run `npm run dev`

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
HOUSEHOLD_PASSCODE=panini2026
```

## Verify database seed

```bash
npm run verify-seed
```

Should output 992 stickers, 1984 album slots.

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add the three env vars above in Vercel's dashboard
4. Deploy

## Architecture

- **Passcode gate**: `panini2026` — verified server-side via `/api/verify-passcode`
- **Auth**: No Supabase Auth — single shared anon key with permissive RLS
- **Users**: Simon (🟦 blue) and Paul (🟧 orange) — stored in Zustand, persisted in localStorage
- **Routing algorithm**: Principal first → Secundario → Repetida (see spec §6)
- **Realtime**: Supabase channels on `inventory`, `album_slots`, `events` → TanStack Query invalidation

## Database

4 tables:
- `stickers` — 992 rows, immutable seed
- `album_slots` — 1984 rows (992 × 2 albums)
- `inventory` — dynamic, one row per physical sticker on hand
- `events` — audit log

## Sections

- `FWC` — 20 FIFA intro/foil stickers (FWC00–FWC19)
- 48 team sections × 20 stickers = 960
- `COC` — 12 Coca-Cola bonus (counted separately)
