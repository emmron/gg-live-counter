# GG Status: live seat availability for GG Gaming Lounge, Joondalup

Customers see which PCs, racing sims and consoles are free, on a map of the actual lounge.
The owner updates it with one click per seat, and the lounge's WordPress site can show it live.

## What's in it

| Who | Where | What |
|---|---|---|
| Customers | `/` | Live seat map of both floors, counts, opening hours |
| Owner | `/` once logged in | Dashboard with a side menu (see below) |
| WordPress | `/wp/gg-seats.zip`, `/widget.js` | Plugin that adds the `[gg_seats]` shortcode |

**Owner dashboard menu**
- **Update seats:** click a seat when someone sits down or leaves (or type `B7` + Enter). Hold and drag to do a row. Undo pops up after every change.
- **Customer view:** exactly what customers see.
- **Floor plan:** rows per floor (PCs per row, gap at the start, gap above), plus counts of sims, PS5s and Xboxes. Live preview; nothing changes until Save. Seats keep their free/taken state.
- **Website widget:** download the WordPress plugin, copy shortcodes, preview.

**WordPress shortcodes** (after installing the plugin)
- `[gg_seats]`: full live card with mini seat map
- `[gg_seats style="compact"]`: one-line badge
- `[gg_seats theme="light"]`, `[gg_seats map="no"]`

## Run locally
```sh
npm install
npm run dev       # http://localhost:5173 (localhost gets the owner dashboard; add ?preview for the customer page)
npm run check
```
Without database env vars, data lives in memory and resets on restart. Dev password: `admin`.

## Deploy to Vercel
1. **Import:** Vercel → Add New → Project → import this GitHub repo. Framework is detected as SvelteKit; no build settings to change (Node 24 is set in `package.json`).
2. **Database:** in the project, go to Storage → Marketplace → **Upstash (Redis)** → create a free database → Connect to this project. This sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
   If this is missing, the owner dashboard shows a red "Database not connected" warning.
3. **Environment variables** (Settings → Environment Variables):
   - `ADMIN_PASSWORD`: the owner's login password
   - `SESSION_SECRET`: any long random string (e.g. `openssl rand -base64 32`)
   - `ADMIN_IPS` (optional): IPs that get the owner view without logging in. Don't use the cafe's wifi IP if customers share it.
4. **Redeploy** so the env vars apply.
5. **Domain:** Settings → Domains → add `status.gggaminglounge.com.au`, then at the DNS provider add
   `CNAME  status  →  cname.vercel-dns.com`.
6. **Owner login:** on the front-desk PC, open `https://status.gggaminglounge.com.au/admin/login` once. It stays logged in for a year.
7. **WordPress:** from the live site's Website widget page, download the plugin. It has the live address baked in. Upload it in WordPress → Plugins.

> `npm run build` on Windows stops at Vercel's final packaging step (symlink permission) unless Developer Mode is on.
> Everything before that builds fine, and Vercel builds on Linux, so deploys are unaffected.

Brand assets in `static/brand/` (logo, helmet, mesh gradient) are from gggaminglounge.com.au.
