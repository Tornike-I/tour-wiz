# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Copilot, Cursor and others) working in this repository.

## Project

Tour Wiz is a mobile web app that plans a visitor's day around their tastes, each sight's quiet hours and their walking pace. It is Team Mercury's entry to the Smart City 2035 hackathon. The final demo is on **21 Nov 2026 at 10:00 CET**, and it must be a working product.

## Read first

| File | What it holds |
|---|---|
| [README.md](README.md) | Problem, research, the **fixed scope**, add-ons, out of scope |
| [TECH.md](TECH.md) | Architecture, stack, data model, planner rules, API, privacy, open questions |
| [docs/](docs) | Hackathon brief, idea pitch, interview sheet |

If the code and TECH.md disagree, tell the user. Do not silently pick one.

## Hackathon rules

- **The scope was fixed on 8 Nov and cannot change.** Build the five core parts first. Add-ons come only after all five work, and only in the order the README lists them.
- **Never build anything on the out-of-scope list**: bookings, payments, accounts or login, live crowd sensors, an AI chat assistant, public transport routing, offline maps, city-wide visit scheduling.
- **Everything must be properly licensed.** Add only dependencies, data, fonts, icons and images with a licence that permits use, and note the source. Never scrape Google Maps or Popular Times. Keep OpenStreetMap attribution visible on the map.

## Privacy rules

These come from the pitch and GDPR. They are not optional.

- The taste profile and access needs live only in `localStorage`. Never send them to any server, including our proxy.
- Read location only while the user is planning or walking. Never store or log it.
- No analytics, tracking pixels or third-party scripts that see user data.
- The `/api/route` proxy receives one leg's start and end points and logs no coordinates.

## Secrets

- The OpenRouteService key lives only in the proxy's environment variable `ORS_API_KEY`. It never appears in client code, in the repo, or in logs.
- Commit `.env.example` with empty values, never `.env`.

## Architecture rules

- `src/planner/` and the scoring code are **pure TypeScript**: no React, no `fetch`, no `localStorage`, no `Date.now()`. Pass time and data in as arguments. That keeps the planner deterministic and testable.
- Planning makes **no network calls**. It reads walking times from the city catalogue's precomputed matrix. Only drawing a route leg calls the proxy.
- Every city catalogue must pass the Zod schema in `src/catalogue/`. Change the schema and TECH.md together.
- Tags come from the **shared tag vocabulary** only. Never add a city-specific tag: it breaks profiles moving between cities.
- Every planned stop carries its human-readable reasons, such as matching tags or a quiet slot. Do not remove them.
- Step-free mode must never route over steps or plan a place whose `stepFree` is `"no"`.

## Code style

- TypeScript `strict`. No `any` without a reason in the same line.
- Mobile-first: design at 375 px wide first, and use tap targets of at least 44 px.
- UI text is English and plain.
- Accessibility: use semantic HTML, label every control, meet WCAG AA contrast, and make the route slider keyboard-operable.
- Comments only for a why the code cannot show, in one sentence. No change narration.
- Add a dependency only when it saves real work. Pin it in the lockfile and say why in the PR.

## Commands

Keep this list accurate:

```bash
npm install
npm run dev          # local dev server
npm test             # Vitest
npm run build        # production build
npm run catalogue    # rebuild data/cities/prague.json from Overpass + ORS (ORS_API_KEY in .env)
npm run catalogue -- --estimate-walk   # same, with straight-line walking times and no key
```

## Before you finish a change

1. `npm test` and `npm run build` pass.
2. Planner or scoring changes come with Vitest tests covering the rule they touch.
3. Catalogue changes pass schema validation.
4. UI changes have been checked at phone width.
5. README.md and TECH.md still describe what the code does.

## Git

- Work on a branch, never directly on `main`. Open a PR with a short description of what changed and why.
- Never force-push or rewrite history on a branch that has a PR. Review fixes go on as new commits.
- Never commit secrets, `.env`, `node_modules/` or build output.
