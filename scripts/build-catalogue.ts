// Builds data/cities/<city>.json from the seed list, OpenStreetMap and OpenRouteService.
//
//   npm run catalogue                      # Prague, walking times from ORS (needs ORS_API_KEY)
//   npm run catalogue -- --estimate-walk   # straight-line estimates, no key needed
//   npm run catalogue -- <city-id>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseCity } from "../src/catalogue";
import type { City } from "../src/catalogue/schema";
import {
  checkMatrix,
  estimateWalkSeconds,
  mergePlace,
  parseCrowdCsv,
  pickRestPoints,
  seedSchema,
  type OsmElement,
} from "./catalogue-lib";

// One endpoint only: mirrors lag behind and give different results for the same ids.
const OVERPASS = "https://overpass-api.de/api/interpreter";
const ORS_MATRIX = "https://api.heigit.org/v2/matrix";
const USER_AGENT = "tour-wiz-catalogue/0.1 (hackathon project)";

const args = process.argv.slice(2);
const estimateWalk = args.includes("--estimate-walk");
const cityId = args.find((a) => !a.startsWith("--")) ?? "prague";

try {
  process.loadEnvFile();
} catch {
  // No .env file; ORS_API_KEY may still come from the shell.
}

async function main() {
  const seed = seedSchema.parse(readJson(`data/places/${cityId}.json`));
  const crowdPath = `data/crowd/${cityId}.csv`;
  const crowd = existsSync(crowdPath) ? parseCrowdCsv(readFileSync(crowdPath, "utf8")) : new Map();

  const unknownCrowd = [...crowd.keys()].filter((id) => !seed.places.some((p) => p.id === id));
  if (unknownCrowd.length > 0) throw new Error(`${crowdPath} has rows for unknown places: ${unknownCrowd.join(", ")}`);

  console.log(`Fetching ${seed.places.length} places from OpenStreetMap…`);
  const elements = await overpass(placesQuery(seed.places.map((p) => p.osmId)));
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
  if (errors.length > 0) throw new Error(`Cannot build ${cityId}:\n${errors.map((e) => `  ${e}`).join("\n")}`);

  console.log("Fetching rest points (benches, cafés, toilets)…");
  const restCandidates = await overpass(restPointsQuery(places.map((p) => p.location)));
  const restPoints = pickRestPoints(places, restCandidates);

  const ids = places.map((p) => p.id);
  const locations = places.map((p) => p.location);
  let walk: number[][];
  let walkStepFree: number[][];
  if (estimateWalk) {
    console.warn("  warning: --estimate-walk: walking times are straight-line estimates, not real routes");
    walk = estimateWalkSeconds(locations);
    walkStepFree = walk;
  } else {
    const key = process.env.ORS_API_KEY;
    if (!key) throw new Error("ORS_API_KEY is not set. Put it in .env, or run with --estimate-walk.");
    console.log("Fetching walking matrices from OpenRouteService…");
    walk = checkMatrix(ids, await orsMatrix("foot-walking", locations, key), "foot-walking");
    walkStepFree = checkMatrix(ids, await orsMatrix("wheelchair", locations, key), "wheelchair");
  }

  const city: City = parseCity({
    id: seed.id,
    name: seed.name,
    countryCode: seed.countryCode,
    timezone: seed.timezone,
    center: seed.center,
    walkSource: estimateWalk ? "estimate" : "openrouteservice",
    places,
    restPoints,
    walk: { ids, seconds: walk },
    walkStepFree: { ids, seconds: walkStepFree },
  });

  const out = `data/cities/${cityId}.json`;
  writeFileSync(out, formatCity(city));
  console.log(`Wrote ${out}: ${places.length} places, ${restPoints.length} rest points, ${warnings.length} warnings.`);
}

function placesQuery(osmIds: string[]): string {
  const group = (type: string) =>
    osmIds.filter((id) => id.startsWith(`${type}/`)).map((id) => id.split("/")[1]);
  const parts = (["node", "way", "relation"] as const)
    .map((type) => [type, group(type)] as const)
    .filter(([, ids]) => ids.length > 0)
    .map(([type, ids]) => `${type}(id:${ids.join(",")});`);
  return `[out:json][timeout:90];(${parts.join("")});out tags center;`;
}

function restPointsQuery(locations: [number, number][]): string {
  const around = locations
    .map(([lat, lon]) => `nwr(around:150,${lat},${lon})["amenity"~"^(bench|cafe|toilets)$"];`)
    .join("");
  return `[out:json][timeout:120];(${around});out tags center;`;
}

async function overpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(OVERPASS, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`${OVERPASS} answered ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[] };
      return json.elements;
    } catch (err) {
      lastError = err;
      const wait = 2000 * (attempt + 1);
      console.warn(`  Overpass attempt ${attempt + 1} failed (${String(err)}); retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`Overpass failed after retries: ${String(lastError)}`);
}

async function orsMatrix(
  profile: "foot-walking" | "wheelchair",
  locations: [number, number][],
  key: string,
): Promise<(number | null)[][]> {
  const res = await fetch(`${ORS_MATRIX}/${profile}`, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ locations: locations.map(([lat, lon]) => [lon, lat]), metrics: ["duration"] }),
  });
  if (!res.ok) throw new Error(`ORS ${profile} matrix answered ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { durations: (number | null)[][] };
  return json.durations;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Puts each array of numbers on one line so matrix rows and crowd curves stay readable in diffs.
function formatCity(city: City): string {
  return (
    JSON.stringify(city, null, 2).replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (_, nums: string) =>
      `[${nums.split(/,\s*/).join(", ")}]`,
    ) + "\n"
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
