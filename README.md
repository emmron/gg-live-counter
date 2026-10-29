# GG Status: live seat availability for GG Gaming Lounge, Joondalup

Customers open the site and see which PCs are free, on a map of the actual lounge
(ground floor rows A–B, upstairs rows C–E, racing sims and consoles).

The owner's front-desk PC sees the same site split in half:
- **Left:** the seat map. **Click a seat** when someone sits down or leaves (or type `B7` + Enter).
  Hold and drag to switch a whole row. `Ctrl+Z` or the Undo pop-up reverts.
- **Right:** exactly what customers see, updating instantly.

The floor plan is set up once at **/admin/layout** (drag seats, rename, add/remove, flip which side the screen is on).

## Who gets the owner view
- Any device that has logged in once at **/admin/login** (stays logged in for a year), **or**
- Any IP listed in `ADMIN_IPS`.
  ⚠ A cafe's public IP is shared by everyone on its wifi. Only use `ADMIN_IPS` if customers are on a different network; otherwise just log in once on the front-desk PC.
- `localhost` always gets it during development.

## Run locally
```sh
npm install
npm run dev        # http://localhost:5173 (owner view on localhost; add ?preview for the customer view)
npm run check
```
Without Redis env vars, data is kept in memory and resets when the server restarts. Dev password is `admin`.

## Deploy (Vercel)
1. Push to GitHub, then on Vercel use **Add New → Project** and import it.
2. **Storage → Marketplace → Upstash (Redis)**: create a free DB and connect it (sets the env vars).
3. **Settings → Environment Variables**: `ADMIN_PASSWORD`, `SESSION_SECRET` (long random string), optional `ADMIN_IPS`.
4. **Settings → Domains**: add `status.gggaminglounge.com.au`. At the DNS provider, add
   `CNAME  status  →  cname.vercel-dns.com`.

Brand assets in `static/brand/` (logo, helmet, Spartan art, mesh gradient) come from gggaminglounge.com.au.

> `npm run build` on Windows fails at the last Vercel packaging step (symlink permission) unless
> Developer Mode is on. Vercel's own Linux builds are unaffected.
