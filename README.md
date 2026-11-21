# Philanthropy Connect

A funding intelligence platform for grant-seekers.

## Local development

```bash
npm install
npm run dev          # → http://localhost:5173
```

## CI/CD

Push to `main` → GitHub Actions builds and deploys to GitHub Pages automatically.

## Setup checklist

1. **Enable GitHub Pages** in repo Settings → Pages → Source: "GitHub Actions"
2. **Add secret**: Settings → Secrets → `VITE_PROXY_URL` = your Anthropic proxy URL
3. **Update `vite.config.js`** `base` if your repo is not at the root domain
4. **Update `index.html`** CSP `connect-src` to your proxy domain

## Data updates

Edit any file in `/data/*.json` and push to `main` — the pipeline rebuilds automatically.
No code changes needed.

A scheduled task refreshes `data/opportunities.json` every two weeks with newly
published open funding opportunities (see `data/opportunities.json` schema below
for the `deadline` field it relies on).

### Opportunity deadlines & visibility

Each entry in `data/opportunities.json` may include a `deadline` field:

- `"deadline": "2026-08-21"` (a `YYYY-MM-DD` date) — the opportunity is shown on
  the Open Opportunities page, in search, and in the outreach picker only while
  that date is today or in the future. Once the date passes, it's automatically
  hidden — no manual removal needed.
- `"deadline": null`, `"deadline": "Rolling deadline"`, `"deadline": "Continuous"`,
  or the field omitted entirely — always shown, since there's no hard cutoff.

This filtering happens in `src/main.js` (`isOpenByDeadline`), so expired entries
can stay in the JSON file for historical reference without cluttering the UI —
though the biweekly update also prunes opportunities that have been closed for
a while to keep the file tidy.

### Cause areas, donors and matches

Cause areas live in `data/causes.json` (`slug`, `name`, and `"featured": true` for the
nine original causes, which keep their pill order). Every other cause is listed A–Z in the
"More cause areas" dropdown with a count for the page being viewed; causes with no entries
yet are disabled. Every `cause` value in `opportunities.json`, `signals.json` and
`matches.json` must be a slug from `causes.json`.

For each open opportunity, add a donor to `signals.json` (the funder's open or announced
program, with an evidence `url`) and a pairing to `matches.json` whose `opp` equals the
opportunity `title` exactly. On the Open Opportunities page, **Group by cause (A–Z)** shows
each cause with its opportunities followed by its matched donors.

## Architecture

```
GitHub repo
├── data/
│   ├── opportunities.json   ← edit to add/update opportunities
│   ├── signals.json         ← edit to add/update donor signals
│   ├── matches.json         ← edit to add/update matches
│   └── causes.json          ← cause-area taxonomy (slug + display name)
├── src/
│   ├── main.js              ← all app logic
│   └── styles.css           ← all styles
├── index.html               ← shell, no hardcoded data
├── vite.config.js           ← build config + proxy URL injection
└── .github/workflows/
    └── deploy.yml           ← push to main → GitHub Pages
```

## Security

- **No API key in source.** `VITE_PROXY_URL` points to a proxy (Cloudflare Worker
  or your own backend) that holds the real Anthropic key and enforces rate limits.
- **All user input** is sanitized before use; AI output is set via `.textContent`,
  never `.innerHTML`.
- **CSP header** restricts fetch to your proxy domain only.

## Proxy (Cloudflare Worker — 20 lines)

```js
export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': 'https://YOUR_PAGES_URL',
                 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' }
    })
    const body = await req.json()
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'x-api-key': ANTHROPIC_API_KEY,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json',
                 'Access-Control-Allow-Origin': 'https://YOUR_PAGES_URL' }
    })
  }
}
```
