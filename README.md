# GG Status: live PC availability for GG Gaming Cafe, Joondalup

A cinema-seat-picker-style map showing which PCs are free. The public page is `/`. The owner updates PCs at `/admin`.

## Stack
SvelteKit 3 (Svelte 5) · Upstash Redis (one JSON key, `gg:state`) · deployed on Vercel.
The public page polls `/api/status` every 5s.

## Run locally
```sh
npm install
npm run dev          # http://localhost:5173. Admin password is "admin" when ADMIN_PASSWORD is unset
npm run check
```
Without Redis env vars, state is kept in memory and resets when the server restarts.

## Admin cheat sheet (`/admin`, press `?` for help)
| | |
|---|---|
| Click / Shift-click / drag a box | select PCs |
| Right-click | quick menu |
| `F` `U` `R` `O` | Free · In use · Reserved · Offline |
| `1`–`9` | "free in 10–90 min" (marks the PC in use) · `0` clears |
| Arrows / Shift+arrows | move / extend the selection |
| `A` | select the whole zone · `Ctrl+A` selects all |
| `/` | jump to a PC by label |
| `Ctrl+Z` | undo |
| `L` | layout mode: drag to move/swap, `N` add, `Enter` rename, `Del` remove, `1/2/3` zone (PC/sim/console), `T` flip screen side, `Ctrl+S` save |

## Deploy (Vercel)
1. Push this repo to GitHub, then use **Add New → Project** on Vercel and import it (framework is detected as SvelteKit).
2. **Storage → Marketplace → Upstash (Redis)**, create a free DB and connect it to the project. This sets the env vars.
3. **Settings → Environment Variables**: add `ADMIN_PASSWORD` and `SESSION_SECRET`, then redeploy.
4. **Settings → Domains**: add `status.<theirdomain>.com`. At the domain's DNS provider, add
   `CNAME  status  →  cname.vercel-dns.com`.

The first request seeds a floor plan based on the venue: 80 PCs on 4 back-to-back benches (rows A–H, 10 per side), 3 racing sims, 2 PS5 + 2 Xbox. Bench lengths, sim/console spots and console count are best guesses, so fix them in layout mode (`T` flips which side a seat's screen is on).

> Note: `npm run build` on Windows fails at the final Vercel packaging step (symlink permission) unless
> Developer Mode is on. This doesn't affect Vercel's own Linux builds.
