// Builds data/cities/<city>.json from the seed list, OpenStreetMap and OpenRouteService.
//
//   npm run catalogue                      # Prague, walking times from ORS (needs ORS_API_KEY)
//   npm run catalogue -- --estimate-walk   # straight-line estimates, no key needed
//   npm run catalogue -- <city-id>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseCity, type City } from "../src/catalogue/index.ts";
import {
  checkMatrix,
  estimateWalkSeconds,
  formatJson,
  mergePlace,
  parseCrowdCsv,
  pickRestPoints,
  seedSchema,
  type OsmElement,
} from "./catalogue-lib.ts";

// One endpoint only: mirrors lag behind and give different results for the same ids.
const OVERPASS = "https://overpass-api.de/api/interpreter";
const ORS_MATRIX = "https://api.openrouteservice.org/v2/matrix";
const USER_AGENT = "tour-wiz-catalogue/0.1 (hackathon project)";

const args = process.argv.slice(2);
const estimateWalk = args.includes("--estimate-walk");
const cityId = args.find((a) => !a.startsWith("--")) ?? "prague";
if (existsSync(".env")) process.loadEnvFile();

async function main() {
  const seed = seedSchema.parse(JSON.parse(readFileSync(`data/places/${cityId}.json`, "utf8")));
  const crowdPath = `data/crowd/${cityId}.csv`;
  const crowd = existsSync(crowdPath) ? parseCrowdCsv(readFileSync(crowdPath, "utf8")) : new Map();
  const unknown = [...crowd.keys()].filter((id) => !seed.places.some((p) => p.id === id));
  if (unknown.length > 0) throw new Error(`${crowdPath} has rows for unknown places: ${unknown.join(", ")}`);

  console.log(`Fetching ${seed.places.length} places from OpenStreetMap…`);
  const elements = await overpass(
    `[out:json][timeout:90];(${seed.places.map((p) => p.osmId.replace("/", "(") + ");").join("")});out tags center;`,
  );
  const byId = new Map(elements.map((e) => [`${e.type}/${e.id}`, e]));

  const errors: string[] = [];
  const warnings: string[] = [];
  const places = seed.places.flatMap((s) => {
    const result = mergePlace(s, byId.get(s.osmId), crowd.get(s.id));
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    return result.place ? [result.place] : [];
  });
  warnings.forEach((w) => console.warn(`  warning: ${w}`));
  if (errors.length > 0) throw new Error(`Cannot build ${cityId}:\n  ${errors.join("\n  ")}`);

  console.log("Fetching rest points (benches, cafés, toilets)…");
  const around = places
    .map(({ location: [lat, lon] }) => `nwr(around:150,${lat},${lon})["amenity"~"^(bench|cafe|toilets)$"];`)
    .join("");
  const restPoints = pickRestPoints(places, await overpass(`[out:json][timeout:120];(${around});out tags center;`));

  const ids = places.map((p) => p.id);
  const locations = places.map((p) => p.location);
  let walk: number[][];
  let walkStepFree: number[][];
  if (estimateWalk) {
    console.warn("  warning: --estimate-walk: walking times are straight-line estimates, not real routes");
    walk = walkStepFree = estimateWalkSeconds(locations);
  } else {
    const key = process.env.ORS_API_KEY;
    if (!key) throw new Error("ORS_API_KEY is not set. Put it in .env, or run with --estimate-walk.");
    console.log("Fetching walking matrices from OpenRouteService…");
    walk = checkMatrix(ids, await orsMatrix("foot-walking", locations, key), "foot-walking");
    walkStepFree = checkMatrix(ids, await orsMatrix("wheelchair", locations, key), "wheelchair");
  }

  const city: City = parseCity({
    ...{ id: seed.id, name: seed.name, countryCode: seed.countryCode, timezone: seed.timezone, center: seed.center },
    walkSource: estimateWalk ? "estimate" : "openrouteservice",
    places,
    restPoints,
    walk: { ids, seconds: walk },
    walkStepFree: { ids, seconds: walkStepFree },
  });

  const out = `data/cities/${cityId}.json`;
  writeFileSync(out, formatJson(city) + "\n");
  console.log(`Wrote ${out}: ${places.length} places, ${restPoints.length} rest points, ${warnings.length} warnings.`);
}

async function overpass(query: string): Promise<OsmElement[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(OVERPASS, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
      return ((await res.json()) as { elements: OsmElement[] }).elements;
    } catch (err) {
      if (attempt === 6) throw err;
      console.warn(`  Overpass attempt ${attempt} failed (${String(err)}); retrying in ${2 * attempt}s`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function orsMatrix(profile: string, locations: [number, number][], key: string) {
  const res = await fetch(`${ORS_MATRIX}/${profile}`, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ locations: locations.map(([lat, lon]) => [lon, lat]), metrics: ["duration"] }),
  });
  if (!res.ok) throw new Error(`ORS ${profile} matrix answered ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { durations: (number | null)[][] }).durations;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
