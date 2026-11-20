import { z } from "zod";
import { placeSchema, type Level, type Place, type RestPoint } from "../src/catalogue/schema";

export const seedSchema = z.object({
  id: z.string(),
  name: z.string(),
  countryCode: z.string(),
  timezone: z.string(),
  center: z.tuple([z.number(), z.number()]),
  places: z.array(
    placeSchema
      .pick({ id: true, osmId: true, name: true, tags: true, visitMinutes: true, url: true })
      .extend({
        openingHours: z.string().optional(),
        openingHoursNote: z.string().optional(),
        stepFree: placeSchema.shape.stepFree.optional(),
        stepFreeNote: z.string().optional(),
      }),
  ),
});

export type Seed = z.infer<typeof seedSchema>;
export type SeedPlace = Seed["places"][number];

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type CrowdRow = { weekday?: Level[]; weekend?: Level[]; source: string };

// A generic daytime sightseeing curve so the planner has something to work with
// before real counts exist. It is labelled as a placeholder in the catalogue.
const PLACEHOLDER_WEEKDAY: Level[] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 0, 0, 0];
const PLACEHOLDER_WEEKEND: Level[] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 3, 3, 2, 2, 1, 1, 1, 0, 0, 0];
export const PLACEHOLDER_SOURCE = "PLACEHOLDER: generic sightseeing curve, not measured";

export function parseCrowdCsv(text: string): Map<string, CrowdRow> {
  const rows = new Map<string, CrowdRow>();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith("#"));
  const [header, ...body] = lines;
  if (!header?.startsWith("placeId,dayType,")) {
    throw new Error('crowd CSV must start with the header "placeId,dayType,h00,…,h23,source"');
  }
  for (const [n, line] of body.entries()) {
    const cells = splitCsvLine(line);
    const [placeId, dayType] = cells;
    const levels = cells.slice(2, 26).map(Number);
    const source = cells.slice(26).join(",").trim();
    const where = `crowd CSV row ${n + 2}`;
    if (!placeId || (dayType !== "weekday" && dayType !== "weekend")) {
      throw new Error(`${where}: needs a placeId and dayType "weekday" or "weekend"`);
    }
    if (levels.length !== 24 || levels.some((v) => !Number.isInteger(v) || v < 0 || v > 4)) {
      throw new Error(`${where}: needs 24 hourly levels from 0 to 4`);
    }
    if (!source) throw new Error(`${where}: every row needs a source`);
    const row = rows.get(placeId) ?? { source };
    row[dayType] = levels as Level[];
    row.source = row.source === source ? source : `${row.source}; ${source}`;
    rows.set(placeId, row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

export function elementLocation(el: OsmElement): [number, number] | undefined {
  if (el.center) return [el.center.lat, el.center.lon];
  if (el.lat !== undefined && el.lon !== undefined) return [el.lat, el.lon];
  return undefined;
}

function stepFreeFromOsm(value: string | undefined): Place["stepFree"] | undefined {
  return value === "yes" || value === "limited" || value === "no" ? value : undefined;
}

export type MergeResult = { place?: Place; errors: string[]; warnings: string[] };

export function mergePlace(
  seed: SeedPlace,
  osm: OsmElement | undefined,
  crowd: CrowdRow | undefined,
): MergeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = `${seed.id} (${seed.osmId})`;

  if (!osm) return { errors: [`${label}: not found in OpenStreetMap`], warnings };

  const location = elementLocation(osm);
  if (!location) errors.push(`${label}: OSM element has no location`);

  const openingHours = seed.openingHours ?? osm.tags?.opening_hours;
  if (!openingHours) errors.push(`${label}: no opening_hours in OSM; add "openingHours" and a note to the seed`);

  let stepFree = seed.stepFree ?? stepFreeFromOsm(osm.tags?.wheelchair);
  if (!stepFree) {
    warnings.push(`${label}: no wheelchair tag in OSM; treated as not step-free`);
    stepFree = "no";
  }

  if (!crowd?.weekday || !crowd.weekend) {
    warnings.push(`${label}: no measured crowd data; using placeholder curve`);
  }

  if (errors.length > 0 || !location || !openingHours) return { errors, warnings };

  const place: Place = {
    id: seed.id,
    osmId: seed.osmId,
    name: seed.name,
    location: [round(location[0], 6), round(location[1], 6)],
    tags: seed.tags,
    openingHours,
    visitMinutes: seed.visitMinutes,
    crowd: {
      weekday: crowd?.weekday ?? PLACEHOLDER_WEEKDAY,
      weekend: crowd?.weekend ?? PLACEHOLDER_WEEKEND,
    },
    crowdSource: crowd?.weekday && crowd.weekend ? crowd.source : PLACEHOLDER_SOURCE,
    stepFree,
    ...(seed.url ? { url: seed.url } : {}),
  };
  return { place, errors, warnings };
}

export function pickRestPoints(
  places: Pick<Place, "location">[],
  candidates: OsmElement[],
  perKindPerPlace = 2,
): RestPoint[] {
  const chosen = new Map<string, RestPoint>();
  for (const place of places) {
    for (const kind of ["bench", "cafe", "toilets"] as const) {
      candidates
        .filter((c) => c.tags?.amenity === kind && elementLocation(c))
        .map((c) => ({ c, d: metres(place.location, elementLocation(c)!) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, perKindPerPlace)
        .forEach(({ c }) => {
          const loc = elementLocation(c)!;
          chosen.set(`${c.type}/${c.id}`, { location: [round(loc[0], 6), round(loc[1], 6)], kind });
        });
    }
  }
  return [...chosen.values()];
}

export function metres(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// Straight-line distance × 1.3 for street detours, at 1.25 m/s (about 4.5 km/h).
export function estimateWalkSeconds(locations: [number, number][]): number[][] {
  return locations.map((a) => locations.map((b) => Math.round((metres(a, b) * 1.3) / 1.25)));
}

export function checkMatrix(ids: string[], durations: (number | null)[][], label: string): number[][] {
  const missing: string[] = [];
  const seconds = durations.map((row, i) =>
    row.map((value, j) => {
      if (value === null) {
        missing.push(`${ids[i]} → ${ids[j]}`);
        return 0;
      }
      return Math.round(value);
    }),
  );
  if (missing.length > 0) {
    throw new Error(`${label}: no route for ${missing.length} pairs, e.g. ${missing.slice(0, 5).join(", ")}`);
  }
  return seconds;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Places a step-free plan may visit; only their rows and columns of the wheelchair matrix are ever read. */
export function stepFreeIndices(places: Pick<Place, "stepFree">[]): number[] {
  return places.flatMap((p, i) => (p.stepFree === "no" ? [] : [i]));
}

// Rows and columns outside `indices` keep the walking times: the planner never reads them in step-free mode.
export function fillStepFree(walk: number[][], indices: number[], sub: number[][]): number[][] {
  const full = walk.map((row) => [...row]);
  indices.forEach((i, a) => indices.forEach((j, b) => (full[i]![j] = sub[a]![b]!)));
  return full;
}
