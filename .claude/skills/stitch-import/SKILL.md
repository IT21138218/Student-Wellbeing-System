---
name: stitch-import
description: Convert a Google Stitch (stitch.withgoogle.com) UI export into a real React component in this app. Use when the user pastes Stitch HTML/CSS, drops a Stitch screenshot or PNG, mentions Stitch, or asks to turn a generated/AI design or mockup into a working screen in frontend/src/components/. Rewrites the markup into this codebase's dark palette, class conventions, real API data, and role gating.
---

# Stitch → Student Wellbeing component

Stitch generates standalone HTML/CSS with its own colors, its own fonts, and
placeholder text. Pasting that in as-is produces a screen that looks foreign
next to the rest of this app and displays fake data. This skill converts it.

**Stitch has no API or MCP connector.** The user brings the output here by
hand — pasted HTML/CSS, a screenshot, or a "Copy to Figma" paste. Never
claim to fetch from stitch.withgoogle.com.

## Step 1 — Get the source

Accept any of: pasted HTML/CSS, an image file (read it with Read), or a
description. If given only a vague ask ("make it like Stitch"), ask for the
actual export first — do not invent a design.

Identify what the screen IS before converting: a new tool panel, a
replacement for an existing component, or a sub-view. If it replaces
something, read that file first and preserve its behaviour.

## Step 2 — Map to real design tokens

Stitch emits its own palette. Replace it — never keep Stitch's raw hex
values. Use what this codebase already uses:

| Role | Value |
|---|---|
| Body text | `#e4e2e6` |
| Muted / secondary | `#83868f`, `#64748b` |
| Dimmed / hints | `#475569`, `#6b6e76` |
| Accent (primary) | `#3b82f6` (`--color-primary`) |
| Page background | `#020617`, panels `#0f172a` |
| Card background | `rgba(255,255,255,0.02)` – `0.03` |
| Card border | `1px solid rgba(255,255,255,0.08)` |
| Active/selected border | `1.5px solid #3b82f6` on `rgba(59,130,246,0.12)` |
| Success / low risk | `#22c55e` (charts: `#4c9a6a`) |
| Warning / medium | `#f59e0b` (charts: `#c98a3e`) |
| Danger / high risk | `#ef4444` (charts: `#b5544c`) |
| Radius | 8px controls, 10–12px cards |
| Font | `'Plus Jakarta Sans', 'Inter', sans-serif`; `font-family: inherit` on buttons/inputs |

Risk labels always use the LOW/MEDIUM/HIGH color triple above — never
recolor them to match a Stitch mockup.

## Step 3 — Choose styling method (match the neighbours)

- **A dedicated `.css` file** when the component is a full tool panel with
  many elements. Follow `frontend/src/styles/WellbeingIndicator.css`: a
  banner comment, a component prefix on every class (`.wi-`, `.ra-`), and
  section dividers.
- **Inline `style={{}}` objects** for small/localised components. Follow
  `StudentPicker.jsx` and `GuardiansManager.jsx`.

Pick whichever the surrounding code uses. Do not introduce a new styling
system (no Tailwind config changes, no CSS-in-JS library, no new deps).

## Step 4 — Strip the placeholder data

This is the step that matters most. Stitch fills designs with invented
names, fake numbers, and lorem text. **Every one must be replaced with real
data or a real empty state.** Never ship a screen showing numbers that
aren't computed.

Wire to the existing API layer in `frontend/src/api/` — never `fetch()`
directly, so auth headers and 401 handling work:

| Need | Use |
|---|---|
| Cohort stats, trends, risk distribution | `getOverviewStats()` — `api/overview.js` |
| Registered student accounts (Mongo) | `listRegisteredStudents()` — `api/students.js` |
| CSV cohort S001–S300 | `listForecastStudents()` — `api/forecast.js` |
| Logged-in user | `getCurrentUser()` — `constants/permissions.js` |

If no endpoint exists for what the design shows, say so and propose one —
do not fabricate the data to make the screenshot match.

## Step 5 — Handle every state

A Stitch mockup only ever shows the happy path. Add the rest:

- **loading** — `Loading …` in `#94a3b8`, 13px
- **error** — red alert box: `rgba(239,68,68,0.1)` bg, `#ef4444` text,
  `1px solid rgba(239,68,68,0.3)`, radius 10
- **empty** — icon + bold line + one explanatory sentence saying what would
  make it non-empty (see `StudentPicker.jsx` `EmptyState`)
- **no search match** — when the design has a search box

## Step 6 — Role gating

If the screen exposes anything role-sensitive:

- Add the tool to `TOOL_ROLES` in `frontend/src/constants/permissions.js`
- Gate the sidebar entry in `Dashboard.jsx` with `visible('yourTool')`, or
  `role === 'admin'` for admin-only screens
- **Frontend gating is cosmetic.** The backend route must enforce it with
  `require_roles(...)` in `backend/app/api/v1/routes/` — admin always passes
  there unconditionally. Never rely on hiding a button as the security
  boundary.

## Step 7 — Wire it into the Dashboard

1. Import at the top of `frontend/src/pages/Dashboard.jsx`
2. Sidebar `<button onClick={() => setActiveTool('yourTool')}>` with a
   `material-symbols-outlined` icon
3. Render block: `{activeTool === 'yourTool' && <YourTool />}`
4. Add the title to the header ternary

## Step 8 — Verify before reporting

```
cd frontend && npx vite build
```

Must exit 0. Then state plainly what is real data and what is still a
placeholder — do not describe a screen as "complete" if any value is
hardcoded.

## Rules

- Never keep Stitch's fonts, palette, or lorem text
- Never add a dependency to satisfy a mockup
- Never `fetch()` around `api/client.js`
- Never present invented numbers as real; use an empty state instead
- Match the file's existing comment density and idiom — comments explain
  *why*, not *what*
