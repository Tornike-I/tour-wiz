# Tour Wiz: technical design

How we build the committed scope in [README.md](README.md). This is a proposal: change it as decisions are made, and keep it describing the current state.

## Constraints from the pitch

These were fixed on 8 Nov and are not up for debate:

- Mobile-first web app that runs in any phone browser.
- OpenStreetMap map; OpenRouteService walking and wheelchair routes.
- One catalogue file per city. Demo: Prague, 30–50 places, English.
- No accounts. The profile and access needs stay on the phone.
- Location is used only while planning or walking.
- The planner uses clear rules, not an AI model.
- Walking routes only. No bookings, payments, live sensors, transit routing or offline maps.

## Architecture

```
            build time                               run time (phone browser)
┌──────────────────────────────┐        ┌──────────────────────────────────────────┐
│ scripts/build-catalogue      │        │  Onboarding ─► Taste profile (localStorage)│
│  Overpass API (OSM places)   │        │                     │                    │
│  + hand-entered crowd curves │──JSON─►│  City catalogue ─► Taste scoring          │
│  + ORS matrix (walk times)   │        │                     │                    │
└──────────────────────────────┘        │                Day planner               │
                                        │                     │                    │
                                        │       Map (Leaflet) + route slider       │
                                        └─────────────────────┬────────────────────┘
                                                              │ one leg at a time
                                                     ┌────────▼────────┐
                                                     │ /api/route proxy │──► OpenRouteService
                                                     └─────────────────┘
```

Planning runs entirely on the phone from the catalogue file. The only network call at run time is drawing the route for a leg.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | React + TypeScript + Vite, Tailwind CSS | Works in any phone browser; one language for app, planner and scripts |
| Map | Leaflet 1.9 (BSD-2), used directly, OSM raster tiles | Simplest OSM map. `react-leaflet` is skipped: its Hippocratic licence adds conditions, and a 100-line wrapper does the job |
| Routing | OpenRouteService directions: `foot-walking`, `wheelchair` | Stair avoidance and route weightings are built in |
| API proxy | One serverless function on Vercel or Netlify | Keeps the ORS key out of the browser; caches responses |
| Catalogue | One JSON file per city, validated with Zod | The schema is the contract that makes "any city" true |
| Opening hours | [`opening_hours`](https://github.com/opening-hours/opening_hours.js) | Parses OSM's `opening_hours` syntax |
| Profile storage | `localStorage` | Stays on the phone; no database |
| Tests | Vitest; Playwright with Pixel 7 (Chromium) and iPhone 14 (WebKit) profiles | Scoring and planner are pure functions; WebKit is Safari's engine |
| Hosting | Vercel free tier, a preview deploy per PR | Static app and proxy in one deploy; HTTPS previews let us open every PR on a real phone |

## Repository layout

```
src/
  catalogue/   Zod schema, shared tag vocabulary, loader
  profile/     taste profile, onboarding, rating updates
  planner/     scoring and day planning (pure, no React)
  map/         Leaflet map, route slider, leg fetching
  ui/          screens and components
e2e/           Playwright tests, run in the Android and iPhone profiles
api/
  route.ts     ORS proxy
scripts/
  build-catalogue.ts   npm run catalogue
  catalogue-lib.ts     pure merge helpers, unit-tested
data/
  places/prague.json   hand-picked places: OSM id, tags, visit time, overrides with a note
  crowd/prague.csv     hand-entered hourly crowd levels, with sources
  cities/prague.json   generated catalogue the app loads
docs/                hackathon brief, pitch, interview sheet
```

## 1 · City place catalogue

One file per city, produced by `scripts/build-catalogue.ts` and committed to the repo.

```ts
type City = {
  id: string;                  // "prague"
  name: string;
  countryCode: string;         // "cz", for public-holiday rules in opening_hours
  timezone: string;            // "Europe/Prague"
  center: [lat: number, lon: number];
  walkSource: "openrouteservice" | "estimate";
  places: Place[];
  restPoints: RestPoint[];     // benches, cafés, public toilets
  walk: { ids: string[]; seconds: number[][] };           // foot-walking
  walkStepFree: { ids: string[]; seconds: number[][] };   // wheelchair
};

type Place = {
  id: string;
  osmId: string;               // "way/123456"
  name: string;
  location: [lat: number, lon: number];
  tags: Tag[];                 // shared vocabulary, see below
  openingHours: string;        // OSM syntax, e.g. "Mo-Su 09:00-17:00"
  visitMinutes: number;
  crowd: { weekday: Level[]; weekend: Level[] };  // 24 values, one per hour
  crowdSource: string;         // where the numbers came from
  stepFree: "yes" | "limited" | "no";
  url?: string;                // link out for tickets
};

type Level = 0 | 1 | 2 | 3 | 4; // empty … packed
type RestPoint = { location: [number, number]; kind: "bench" | "cafe" | "toilets" };
```

**The tag vocabulary is fixed and shared across all cities**; it lives in `src/catalogue/tags.ts` (`castle`, `church`, `museum`, `art`, `history`, `architecture`, `viewpoint`, `park`, `river`, `tea-house`, `cafe`, `beer`, `food-market`, `nightlife`, `music`, `kids`, `shopping`). That is what lets a profile built in Prague work in Barcelona. A tag that exists in only one city does not carry over to the next.

Build steps:
1. Read the seed list `data/places/prague.json`: OSM id, tags, visit time, and optional `openingHours` / `stepFree` overrides, each with a note saying why.
2. Overpass query for those places by OSM id. Read `opening_hours`, `wheelchair` and location. Seed overrides win. A place with no hours anywhere fails the build; a place with no `wheelchair` tag is treated as `"no"`.
3. Merge with `data/crowd/prague.csv` (hourly levels and their source). A place with no rows gets a generic curve whose `crowdSource` starts with `PLACEHOLDER`, so unmeasured data is always visible.
4. Fetch rest points within 150 m of the places from Overpass (`amenity=bench|cafe|toilets`), keeping the two nearest of each kind per place.
5. Call the ORS matrix endpoint twice (walking and wheelchair). 50 × 50 = 2,500 pairs, within one request's limit. Any unreachable pair fails the build. Without an ORS key, `--estimate-walk` fills both matrices with straight-line estimates and sets `walkSource: "estimate"`; the demo build must use `"openrouteservice"`.
6. Validate with the Zod schema (including every `opening_hours` string) and write the JSON file.

## 2 · Taste profile

```ts
type Profile = {
  version: 1;                               // bump when the stored shape changes
  interests: Partial<Record<Tag, number>>;  // weight 0..1
  pace: "relaxed" | "normal" | "brisk";
  maxWalkKmPerDay: number;
  stepFree: boolean;
  restEveryMinutes?: number;
  ratings: Record<string, 1 | 2 | 3 | 4 | 5>;  // "prague/<placeId>"
  group?: { name: string; interests: Tag[] }[];  // add-on 1: up to 5 people travelling with the owner
};
```

**Group and family profiles (add-on 1).** Onboarding can add up to 5 people, each with a name and at least one interest, all on the owner's phone. The planner scores places with `groupInterests`: each tag's weight is averaged over the owner and every member (a member's picked tag counts as 1), so a place more of the group likes ranks higher, and a place only one member likes can still be planned. Each stop's first reason names who it is for, such as `Matches: art (Ana), history (you)`. Pace and access needs stay one setting for the whole group, set for whoever needs them most. Ratings still move only the owner's weights. The field is optional, so profiles saved before it still load.

- Onboarding (about 30 seconds) picks interests, pace and access needs. Each picked interest starts at weight 1.
- A rating moves the weights of that place's tags by `0.2 × (stars − 3) / 2`: 5 stars +0.2, 4 stars +0.1, 3 stars nothing, 2 stars −0.1, 1 star −0.2, kept within 0..1. Tags the traveller never picked start at 0, so a high rating can add a new interest. Rating a place again replaces the earlier rating's effect. Since tags are shared, this carries over to other cities.
- Stored in `localStorage` under the key `tourwiz.profile`, validated on load (broken or unknown-version data is ignored), with a "delete my data" button. Storage that throws, as in Safari private mode, is treated as empty. Nothing leaves the phone.

Pace sets the walking-time factor applied to matrix times and the default daily walking cap: relaxed ×1.25 and 6 km, normal ×1 and 10 km, brisk ×0.85 and 14 km.

Code: `src/profile/` (`createProfile`, `rate`, `groupInterests`, `walkTimeFactor`, `loadProfile` / `saveProfile` / `deleteProfile`).

## 3 · Crowd-aware day planner

Pure function in `src/planner`: `plan(city, profile, { date, start, end, from? }) → DayPlan`. Times are the city's local wall-clock time; the planner builds dates from those fields, so a phone set to another time zone still gets Prague opening hours and crowd hours.

1. **Filter.** Drop places the user rated 1, places whose `stepFree` is `"no"` when the profile needs step-free, and places that match none of the user's interests. Opening hours are checked per visit in step 3.
2. **Score.** `taste = Σ interest weight of the place's tags`, normalised by the best place. A tag that already appeared in today's plan counts half as much for each earlier stop that had it, so the day mixes interests. Unrated places are not penalised.
3. **Build the day greedily.** From the current time and position, consider every remaining place, arriving on 15-minute slots:

   `value = taste − 0.6 · crowd/4 − 0.6 · walk minutes/30 − 0.25 · wait minutes/60`

   Crowd is the highest level during the whole visit, not only at arrival. Waiting is tried for 0, 30 and 60 minutes, and until opening time when the place is closed on arrival (up to 90 minutes). Skip candidates that are not open for the whole visit, end after the day ends, or break the walking cap. Add the best candidate and repeat until nothing fits.
4. **Rest stops.** When a leg's walking time is longer than `restEveryMinutes`, a 10-minute rest goes on that leg. The rest point is picked by `detour + distance to where the limit runs out` (the point `restEveryMinutes / leg minutes` along the straight line, at most 80%). The rest and its detour count in the arrival time and the walking cap. Step-free travellers rest only at benches, because OSM rarely says whether a café or toilet has steps.
5. **Explain.** Every stop carries its reasons: "Matches: tea-house, art", "Quiet at 09:30 (quiet, level 1 of 4)", "Waits 45 min for it to open", "Waits 30 min for a quieter slot", "Step-free access is limited".

Walking times are matrix seconds × the pace factor. The walking cap uses distance ≈ matrix seconds × 1.3 m/s, because the catalogue stores times, not distances. The first leg, from `from` or the city centre, is a straight-line estimate.

The weights live in `WEIGHTS` in `src/planner/plan.ts` and are tuned by hand against Prague. Greedy is enough for 30–50 places.

Success metric support: the plan reports `quietShare`, the share of its stops at crowd level ≤ 1. With the placeholder crowd curves it is 0% for every plan; it becomes meaningful once real counts are in `data/crowd/prague.csv`.

## 4 · Map and route slider

Code: `src/map/` (`DayMap`, `RoutePanel`, `fetchRoute`), shown on the plan screen above the stops.

- Leaflet map with a start dot, numbered stop markers (44 px tap targets) and the route of the selected leg. Tap a marker, the ← → buttons or "Show route here" on a stop to pick the leg.
- The slider (fastest ↔ scenic) has five positions, 0 to 1 in steps of 0.25, so the proxy cache gets hits. It maps to ORS weightings:
  - 0: plain `foot-walking`, shortest time.
  - > 0: `options.profile_params.weightings` with `green` and `quiet` set to the slider value.
- Legs are fetched one at a time when shown, through the proxy, 250 ms after the slider stops moving.
- Walking times in the plan come from the precomputed matrix (fastest route). Next to the slider: the leg's minutes and km, and "about N min longer than planned" for a scenic leg.
- If the proxy fails or has no key, the leg is a dashed straight line with "Route not available right now".
- Step-free mode disables the slider: ORS has `green` and `quiet` only on the foot profiles, so step-free legs are always the plain `wheelchair` route.
- OSM attribution stays visible in the map corner (no Leaflet prefix).

## 5 · Basic accessibility

Onboarding asks three access questions: the step-free switch, "Rest breaks" (no need, after 10 or after 20 minutes of walking) and "Most walking in a day" (2, 4, 6, 10 or 14 km; until picked, it follows the pace: 6, 10 or 14 km).

- **Avoid stairs:** the `wheelchair` profile for routes and the `walkStepFree` matrix for planning; places whose `stepFree` is `"no"` are left out, and that includes places with no `wheelchair` tag in OSM. The plan screen says so. `"limited"` places stay, with the reason "Step-free access is limited".
- **Cap walking distance:** `maxWalkKmPerDay` enforced by the planner, including rest detours.
- **Rest stops:** inserted by the planner from `restPoints` (see step 4 of the planner). The stop card says "N min walk, with a 10 min rest on the way", and the map shows a "Rest" dot on the selected leg. Rest points' opening hours are not known, so a café or toilet may be closed.

"Step-free routes must be very accurate" (SWOT): OSM step and kerb data is uneven. In the demo, label step-free routes as "based on OpenStreetMap data" and check the demo routes on foot.

## API proxy

`POST /api/route`

```json
{ "from": [50.087, 14.421], "to": [50.090, 14.400], "scenic": 0.6, "stepFree": false }
```

Code: `api/route.ts`, a Vercel function. `npm run dev` serves the same handler through a Vite plugin, with `ORS_API_KEY` from `.env`.

- Refuses points outside Prague's bounding box (49.9–50.2 N, 14.2–14.75 E), so the key can't be used for anything else. Widen it when a city is added.
- Rounds points to 5 decimals and `scenic` to quarter steps.
- Picks the profile (`foot-walking` or `wheelchair`), adds weightings for scenic walking legs, and calls ORS with the key from `ORS_API_KEY`.
- Returns `{ path: [lat, lon][], distanceMetres, durationSeconds }`; 400 for bad input, 503 without a key, 502 when ORS fails.
- Caches up to 500 rounded requests in memory. A Vercel instance keeps its cache only while it stays warm.
- Logs no coordinates, only the ORS status code on failure.

## Privacy

| Data | Where it lives |
|---|---|
| Interests, ratings, access needs, group members' names and interests | `localStorage` on the phone only |
| Current location | Read only while planning or walking; never stored or logged |
| Route requests | Start and end of one leg go to the proxy and ORS, nothing else |

Access needs count as health-related data under GDPR, which is why they never leave the device.

## Testing

- Vitest unit tests for scoring, profile updates and the planner. For example: closed places are never planned, step-free profiles get only step-free places, the walking cap holds, and a quiet slot beats a crowded one when tastes are equal.
- Zod validation of every catalogue file, as a Vitest test.
- Playwright end-to-end tests against the production build, in a Pixel 7 profile (Chromium) and an iPhone 14 profile (WebKit). They check the main flows, no horizontal scroll, no console errors and 44 px tap targets.
- GitHub Actions runs typecheck, Vitest, build and Playwright on every PR (`.github/workflows/ci.yml`).
- Real phones: every PR gets a Vercel preview URL over HTTPS, which phone browsers need for location access. Open UI changes on an Android phone and an iPhone before merging, and do a full pass on both before the demo.

## Open questions

- **Crowd data source.** The hackathon requires properly licensed content. Scraping Google Popular Times breaks Google's terms. Plan: our own hourly counts at a few sights, plus figures from public sources we can cite, recorded with their source in `data/crowd/prague.csv`.
- **Scenic slider in step-free mode.** Check whether ORS accepts `green` and `quiet` weightings on the `wheelchair` profile. If not, the slider is disabled when step-free is on.
- **Map tiles.** The public OSM tile server is acceptable for a demo with attribution. Anything beyond that needs a free tile provider.
- **ORS free-tier limits.** Confirm the current daily quotas for directions and matrix before relying on them.
