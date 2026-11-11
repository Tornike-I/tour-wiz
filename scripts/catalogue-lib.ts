import { z } from "zod";
import { placeSchema, type Level, type Place, type RestPoint } from "../src/catalogue/schema.ts";

export const seedSchema = z.object({
  id: z.string(),
  name: z.string(),
  countryCode: z.string(),
  timezone: z.string(),
  center: z.tuple([z.number(), z.number()]),
  places: z.array(
    placeSchema.pick({ id: true, osmId: true, name: true, tags: true, visitMinutes: true, url: true }).extend({
      openingHours: z.string().optional(),
      openingHoursNote: z.string().optional(),
      stepFree: placeSchema.shape.stepFree.optional(),
      stepFreeNote: z.string().optional(),
    }),
  ),
});

export type SeedPlace = z.infer<typeof seedSchema>["places"][number];

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type CrowdRow = { weekday?: Level[]; weekend?: Level[]; source: string };

// A generic daytime curve so the planner has something to work with before real counts exist.
const PLACEHOLDER = {
  weekday: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 0, 0, 0] as Level[],
  weekend: [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 3, 3, 2, 2, 1, 1, 1, 0, 0, 0] as Level[],
};
export const PLACEHOLDER_SOURCE = "PLACEHOLDER: generic sightseeing curve, not measured";

export function parseCrowdCsv(text: string): Map<string, CrowdRow> {
  const rows = new Map<string, CrowdRow>();
  const [header, ...body] = text.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith("#"));
  if (!header?.startsWith("placeId,dayType,")) {
    throw new Error('crowd CSV must start with the header "placeId,dayType,h00,…,h23,source"');
  }
  body.forEach((line, n) => {
    const cells = line.split(",");
    const [placeId, dayType] = cells;
    const levels = cells.slice(2, 26).map(Number);
    const source = cells.slice(26).join(",").trim(); // the source is last, so it may contain commas
    const where = `crowd CSV row ${n + 2}`;
    if (!placeId || (dayType !== "weekday" && dayType !== "weekend")) {
      throw new Error(`${where}: needs a placeId and dayType "weekday" or "weekend"`);
    }
    if (levels.length !== 24 || levels.some((v) => !Number.isInteger(v) || v < 0 || v > 4)) {
      throw new Error(`${where}: needs 24 hourly levels from 0 to 4`);
    }
    if (!source) throw new Error(`${where}: every row needs a source`);
    const row = rows.get(placeId);
    rows.set(placeId, {
      ...row,
      [dayType]: levels as Level[],
      source: row && row.source !== source ? `${row.source}; ${source}` : source,
    });
  });
  return rows;
}

export function elementLocation(el: OsmElement): [number, number] | undefined {
  if (el.center) return [el.center.lat, el.center.lon];
  if (el.lat !== undefined && el.lon !== undefined) return [el.lat, el.lon];
  return undefined;
}

export function mergePlace(seed: SeedPlace, osm: OsmElement | undefined, crowd: CrowdRow | undefined) {
  const label = `${seed.id} (${seed.osmId})`;
  if (!osm) return { errors: [`${label}: not found in OpenStreetMap`], warnings: [] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const location = elementLocation(osm);
  if (!location) errors.push(`${label}: OSM element has no location`);

  const openingHours = seed.openingHours ?? osm.tags?.opening_hours;
  if (!openingHours) errors.push(`${label}: no opening_hours in OSM; add "openingHours" and a note to the seed`);

  const wheelchair = osm.tags?.wheelchair;
  let stepFree = seed.stepFree ?? (wheelchair === "yes" || wheelchair === "limited" || wheelchair === "no" ? wheelchair : undefined);
  if (!stepFree) {
    warnings.push(`${label}: no wheelchair tag in OSM; treated as not step-free`);
    stepFree = "no";
  }

  const measured = crowd?.weekday && crowd.weekend;
  if (!measured) warnings.push(`${label}: no measured crowd data; using placeholder curve`);

  if (!location || !openingHours) return { errors, warnings };

  const place: Place = {
    id: seed.id,
    osmId: seed.osmId,
    name: seed.name,
    location: round(location),
    tags: seed.tags,
    openingHours,
    visitMinutes: seed.visitMinutes,
    crowd: { weekday: crowd?.weekday ?? PLACEHOLDER.weekday, weekend: crowd?.weekend ?? PLACEHOLDER.weekend },
    crowdSource: measured ? crowd.source : PLACEHOLDER_SOURCE,
    stepFree,
    ...(seed.url ? { url: seed.url } : {}),
  };
  return { place, errors, warnings };
}

export function pickRestPoints(places: Pick<Place, "location">[], candidates: OsmElement[], perKindPerPlace = 2) {
  const chosen = new Map<string, RestPoint>();
  for (const place of places) {
    for (const kind of ["bench", "cafe", "toilets"] as const) {
      candidates
        .flatMap((c) => {
          const loc = c.tags?.amenity === kind ? elementLocation(c) : undefined;
          return loc ? [{ key: `${c.type}/${c.id}`, loc, d: metres(place.location, loc) }] : [];
        })
        .sort((a, b) => a.d - b.d)
        .slice(0, perKindPerPlace)
        .forEach(({ key, loc }) => chosen.set(key, { location: round(loc), kind }));
    }
  }
  return [...chosen.values()];
}

export function metres(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// Straight-line distance × 1.3 for street detours, at 1.25 m/s (about 4.5 km/h).
export function estimateWalkSeconds(locations: [number, number][]): number[][] {
  return locations.map((a) => locations.map((b) => Math.round((metres(a, b) * 1.3) / 1.25)));
}

export function checkMatrix(ids: string[], durations: (number | null)[][], label: string): number[][] {
  const missing = durations.flatMap((row, i) => row.flatMap((v, j) => (v === null ? [`${ids[i]} → ${ids[j]}`] : [])));
  if (missing.length > 0) {
    throw new Error(`${label}: no route for ${missing.length} pairs, e.g. ${missing.slice(0, 5).join(", ")}`);
  }
  return durations.map((row) => row.map((v) => Math.round(v ?? 0)));
}

// Short values and arrays of plain values go on one line, so a place takes a few lines and a matrix row one.
export function formatJson(value: unknown, indent = ""): string {
  const flat = JSON.stringify(value);
  if (typeof value !== "object" || value === null || flat.length <= 100) return flat;
  if (Array.isArray(value) && value.every((v) => typeof v !== "object")) return flat;
  const inner = indent + "  ";
  const items = Array.isArray(value)
    ? value.map((v) => inner + formatJson(v, inner))
    : Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, inner)}`);
  return Array.isArray(value)
    ? `[\n${items.join(",\n")}\n${indent}]`
    : `{\n${items.join(",\n")}\n${indent}}`;
}

function round([lat, lon]: [number, number]): [number, number] {
  return [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6];
}
