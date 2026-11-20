# Tour Wiz

> It learns what you like and plans each day around it, the quiet hours and your pace, in every city you visit.

Team Mercury's entry to the **Smart City 2035 Student Hackathon 2026** (Prague).

| | |
|---|---|
| Scope fixed | 8 Nov 2026 (idea pitch). The scope below cannot change. |
| Supervisor consultations | 9–20 Nov 2026, at most 2 × 30 min |
| Final demo and pitch | **20 Nov 2026, from 14:00 CET** (moved from 21 Nov; working product required) |

Source material is in [`docs/`](docs): the [hackathon brief](docs/hackathon-brief.docx), our [idea pitch](docs/idea-pitch.pdf) and the [street interview sheet](docs/tourist-interview-sheet.docx).

---

## Problem

Visitors want the same places at the same time.

- **Crowds.** The top sights fill up at the same hours, and most visitors arrive at the peak.
- **Research.** Planning a good day takes hours across maps, blogs and several apps.
- **One route for all.** Map apps pick the shortest path, not one that fits your interests, pace or mobility.

### City discovery: 11 visitors on Prague's streets

- 7 countries, from Korea and Canada to Spain and Bulgaria.
- 5 of 11 planned their day with Google Maps; 3 of 11 from social media or TikTok.
- Usefulness of the idea: **3.9 / 5** for leisure travellers (rated by 10).
- Both work travellers rated it 1/5 and plan with ChatGPT, so **we build for leisure trips**.

### Global inspiration

- **Check Barcelona** shows visitors when popular sites are less busy.
- **Feel Florence** uses city sensors to point tourists toward quieter areas and routes.
- Both *inform* about crowds. Neither builds a personal day around them. Tour Wiz adds the visitor's tastes and pace.

### Existing apps each solve one piece

| App | Your tastes | Quiet times | Route choice | Step-free |
|---|---|---|---|---|
| Google Maps | Partly | Busy-hours chart | Fastest | Transit only |
| Mindtrip (AI planner) | Yes | — | — | — |
| CrowdAvoid | — | Yes | — | — |
| Scenic-route apps | — | — | Scenic | — |
| **Tour Wiz** | **Yes** | **Plans around them** | **Fastest ↔ scenic** | **Yes, basic** |

---

## How it works

1. **Tell it what you like.** 30 seconds: interests, pace, step-free needs. Done once.
2. **Get a day plan.** Places you'll like, each at its quiet hour.
3. **Walk your way.** Slide from fastest to scenic between stops.
4. **Rate as you go.** Ratings sharpen tomorrow's plan and your next trip.

The taste profile belongs to the traveller, not the city: love tea houses on one trip, and the next city suggests its best one too.

```
City catalogue → Taste scoring → Day planner → Map and routes
```

---

## Committed scope

**Demo:** one city (Prague), 30–50 places · English · mobile web app · no account.

| # | Part | What it does |
|---|---|---|
| 1 | City place catalogue | Tags, opening hours, crowd level per hour, step-free entry. Same format for any city. |
| 2 | Taste profile | Interests and ratings drive suggestions, in every city. |
| 3 | Crowd-aware day planner | Orders stops by quiet hours, opening times and walking distance. |
| 4 | Map and route slider | From fastest to scenic between stops, on an OpenStreetMap map. |
| 5 | Basic accessibility | Avoid stairs, cap walking distance, add rest stops. |

Everything else is an add-on, built only after these five work.

### Potential add-ons, in build order

1. Group and family profiles
2. Money and scam guard (local currency, official rate, known scams)
3. More cities
4. Full accessibility routing (kerbs, slopes, cobbles, accessible toilets)
5. Day trips
6. Local tips and lists
7. Meet other travellers
8. More languages

### Out of scope

| Not doing | Why |
|---|---|
| Bookings and tickets | We link out |
| Payments in the app | No money or payment data handled |
| User accounts and login | The profile lives on the phone |
| Live crowd sensors | Hourly estimates, no hardware |
| AI chat assistant | The planner uses clear rules you can check |
| Public transport routing | Walking routes only |
| Offline maps | The app needs a data connection |
| City-wide visit scheduling | Vision only; needs many users first |

### Privacy

- No account, no sign-up.
- Profile and access needs stay on the phone.
- Location is used only while planning or walking.

---

## Tech stack

React + TypeScript + Vite mobile web app, Leaflet on OpenStreetMap, OpenRouteService walking and wheelchair routes through a small serverless proxy, one JSON catalogue per city, profile in `localStorage`. The planner runs on the phone with no AI model.

Full design, data model, planner rules and open questions: [TECH.md](TECH.md).

---

## Measuring success

**In testing (first users)**
- Time to plan a day, compared with maps and blogs
- Usefulness score from test users, out of 5
- Share of planned visits that fall in quiet hours

**In real use (per city)**
- More visits at off-peak hours
- Fewer peak-hour visitors at the top sights
- Users who open it again on their next trip

## Vision (5–15 years)

When many travellers use it, Tour Wiz can spread them across the day: different users get different quiet slots for the same sight, like traffic routing with suggestions instead of rules, fed by live city sensors in every city.

## Team

Team Mercury.
