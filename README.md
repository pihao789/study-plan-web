# Study Plan – Web App (PWA)

Track reading plans (e.g. Bible in a Year), mark progress, add notes. **Works in any browser; no app store or fee.**

- **Data stays in your browser** (localStorage). Export to back up; import to restore.
- **Progressive Web App**: add to home screen on phone or desktop for an app-like experience.
- **Offline**: after first load, the app can work offline (service worker caches assets).

## Run locally

1. Serve the folder over HTTP (required for PWA and file APIs):
   ```bash
   cd study-plan-web
   npx serve .
   # or: python3 -m http.server 8080
   ```
2. Open `http://localhost:3000` (or the port shown).

## Deploy (free)

- **GitHub Pages**: push this folder to a repo, enable Pages, set source to main branch / root or `docs` if you put the files in `docs/`.
- **Netlify / Vercel**: drag the folder or connect the repo; no build step.

Use **HTTPS** in production so the service worker and “Add to Home Screen” work.

## Features

- Use sample plan (Bible in a Year, 365 days; loaded from `plans/bible-in-a-year-365.json`) or import a JSON plan.
- Multiple plans; each plan has a day list and progress bar.
- “Today” badge based on plan start date (new plans get start date = today).
- Per-day: mark completed, add notes.
- Settings: export all data, import backup, import new plan, clear all, About.
- Export “plan only” (no progress) from the iOS app and import it here, or the other way around (same JSON shape).

## Plan JSON format

```json
{
  "title": "Bible in a Year",
  "startDate": "2025-01-01",
  "days": [
    { "dayNumber": 1, "title": "Day 1", "readings": ["Genesis 1–2", "Matthew 1"] }
  ]
}
```

## Optional: PWA icons

To add custom icons for “Add to Home Screen”, add:

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)

and uncomment or add the `icons` array in `manifest.json`. Without them, the browser uses a default icon.
