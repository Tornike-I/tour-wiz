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
| Map | Leaflet (`react-leaflet`), OSM raster tiles | Simplest OSM map; enough for 50 markers and a route line |
| Routing | OpenRouteService directions: `foot-walking`, `wheelchair` | Stair avoidance and route weightings are built in |
| API proxy | One serverless function on Vercel or Netlify | Keeps the ORS key out of the browser; caches responses |
| Catalogue | One JSON file per city, validated with Zod | The schema is the contract that makes "any city" true |
| Opening hours | [`opening_hours`](https://github.com/opening-hours/opening_hours.js) | Parses OSM's `opening_hours` syntax |
| Profile storage | `localStorage` | Stays on the phone; no database |
| Tests | Vitest | Scoring and planner are pure functions |
| Hosting | Vercel or Netlify free tier | Static app and proxy in one deploy |

## Repository layout

```
src/
  catalogue/   Zod schema, shared tag vocabulary, loader
  profile/     taste profile, onboarding, rating updates
  planner/     scoring and day planning (pure, no React)
  map/         Leaflet map, route slider, leg fetching
  ui/          screens and components
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
  interests: Partial<Record<Tag, number>>;  // weight 0..1
  pace: "relaxed" | "normal" | "brisk";
  maxWalkKmPerDay: number;
  stepFree: boolean;
  restEveryMinutes?: number;
  ratings: Record<string, 1 | 2 | 3 | 4 | 5>;  // "prague/<placeId>"
};
```

- Onboarding (about 30 seconds) picks interests, pace and access needs. Each picked interest starts at weight 1.
- A rating moves the weights of that place's tags: a 5 pulls them up, a 1 pushes them down. Since tags are shared, this carries over to other cities.
- Stored in `localStorage` under one key, with a "delete my data" button. Nothing leaves the phone.

Pace sets the walking speed factor (applied to matrix times) and the default daily walking cap.

## 3 · Crowd-aware day planner

Pure function in `src/planner`: `plan(city, profile, day, start, end) → DayPlan`.

1. **Filter.** Drop places that are closed that day, places that are not step-free when the profile needs it, and places the user rated 1.
2. **Score.** `taste = Σ interest weight of the place's tags`, normalised. Unrated places the user has seen are not penalised.
3. **Build the day greedily.** From the current time and position, consider every remaining place. For each one, compute the arrival time and value:

   `value = taste − α · crowd level at arrival − β · walking minutes`

   Skip candidates that would be closed at arrival, end after closing or after the day ends, or break the walking cap. If waiting up to an hour gives a quieter slot, try that too. Add the best candidate and repeat.
4. **Rest stops.** When the walking time since the last stop or rest exceeds the profile limit, insert the nearest rest point.
5. **Explain.** Every stop carries its reasons, for example "matches: tea-house, art" and "quiet at 09:30 (level 1 of 4)". This is the "clear rules you can check".

α and β are tuned against the demo city. Greedy is enough for 30–50 places. Upgrade to a few greedy runs with different starting stops only if the plans look poor.

Success metric support: the plan reports what share of its stops land at crowd level ≤ 1.

## 4 · Map and route slider

- Leaflet map with numbered stop markers and the route of the selected leg.
- The slider (fastest ↔ scenic) maps to an ORS weighting from 0 to 1:
  - 0: plain `foot-walking`, shortest time.
  - > 0: `options.profile_params.weightings.green = value` (prefers parks and greenery), optionally `quiet` too.
- Legs are fetched one at a time when shown, through the proxy.
- Walking times in the plan come from the precomputed matrix (fastest route). A scenic leg can be longer than planned; show the extra minutes next to the slider.

## 5 · Basic accessibility

- **Avoid stairs:** the `wheelchair` profile for routes and the `walkStepFree` matrix for planning; places filtered by `stepFree`.
- **Cap walking distance:** `maxWalkKmPerDay` enforced by the planner.
- **Rest stops:** inserted by the planner from `restPoints`.

"Step-free routes must be very accurate" (SWOT): OSM step and kerb data is uneven. In the demo, label step-free routes as "based on OpenStreetMap data" and check the demo routes on foot.

## API proxy

`POST /api/route`

```json
{ "from": [50.087, 14.421], "to": [50.090, 14.400], "scenic": 0.6, "stepFree": false }
```

- Picks the profile (`foot-walking` or `wheelchair`), adds weightings, and calls ORS with the key from an environment variable.
- Returns GeoJSON, a distance and a duration.
- Caches by rounded request, so repeated demo runs don't use up the free quota.
- Logs no coordinates.

## Privacy

| Data | Where it lives |
|---|---|
| Interests, ratings, access needs | `localStorage` on the phone only |
| Current location | Read only while planning or walking; never stored or logged |
| Route requests | Start and end of one leg go to the proxy and ORS, nothing else |

Access needs count as health-related data under GDPR, which is why they never leave the device.

## Testing

- Vitest unit tests for scoring, profile updates and the planner. For example: closed places are never planned, step-free profiles get only step-free places, the walking cap holds, and a quiet slot beats a crowded one when tastes are equal.
- Zod validation of every catalogue file in CI.
- Manual check on two real phones (one iOS, one Android) before the demo.

## Open questions

- **Crowd data source.** The hackathon requires properly licensed content. Scraping Google Popular Times breaks Google's terms. Plan: our own hourly counts at a few sights, plus figures from public sources we can cite, recorded with their source in `data/crowd/prague.csv`.
- **Scenic slider in step-free mode.** Check whether ORS accepts `green` and `quiet` weightings on the `wheelchair` profile. If not, the slider is disabled when step-free is on.
- **Map tiles.** The public OSM tile server is acceptable for a demo with attribution. Anything beyond that needs a free tile provider.
- **ORS free-tier limits.** Confirm the current daily quotas for directions and matrix before relying on them.
