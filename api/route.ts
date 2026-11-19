// POST /api/route: one walking leg from OpenRouteService. Keeps the ORS key off the phone and logs no coordinates.

import type { LatLon, RouteRequest, RouteResponse } from "../src/map/routeTypes";

export type { LatLon, RouteRequest, RouteResponse };

// Prague and its surroundings. Requests outside are refused, so the key cannot be used for anything else.
const BOUNDS = { south: 49.9, north: 50.2, west: 14.2, east: 14.75 };
const ORS_DIRECTIONS = "https://api.openrouteservice.org/v2/directions";
const cache = new Map<string, RouteResponse>();
const CACHE_LIMIT = 500;

const toFixed5 = (v: number) => Number(v.toFixed(5));

export function parseRouteRequest(body: unknown): RouteRequest | string {
  const b = body as Partial<Record<keyof RouteRequest, unknown>> | null;
  const point = (p: unknown): LatLon | undefined =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    p[0] >= BOUNDS.south &&
    p[0] <= BOUNDS.north &&
    p[1] >= BOUNDS.west &&
    p[1] <= BOUNDS.east
      ? [toFixed5(p[0]), toFixed5(p[1])]
      : undefined;
  const from = point(b?.from);
  const to = point(b?.to);
  if (!from || !to) return "from and to must be [lat, lon] inside the city";
  if (typeof b?.scenic !== "number" || b.scenic < 0 || b.scenic > 1) return "scenic must be a number from 0 to 1";
  if (typeof b?.stepFree !== "boolean") return "stepFree must be true or false";
  return { from, to, scenic: Math.round(b.scenic * 4) / 4, stepFree: b.stepFree };
}

export function orsRequest(req: RouteRequest): { url: string; body: object } {
  const profile = req.stepFree ? "wheelchair" : "foot-walking";
  const body: Record<string, unknown> = { coordinates: [req.from, req.to].map(([lat, lon]) => [lon, lat]) };
  // ORS offers green and quiet weightings only on the foot profiles, so step-free routes are always the plain route.
  if (!req.stepFree && req.scenic > 0) {
    body.options = { profile_params: { weightings: { green: req.scenic, quiet: req.scenic } } };
  }
  return { url: `${ORS_DIRECTIONS}/${profile}/geojson`, body };
}

type OrsGeoJson = {
  features?: { geometry?: { coordinates?: [number, number][] }; properties?: { summary?: { distance?: number; duration?: number } } }[];
};

export async function route(
  body: unknown,
  key: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<{ status: number; json: RouteResponse | { error: string } }> {
  const req = parseRouteRequest(body);
  if (typeof req === "string") return { status: 400, json: { error: req } };
  if (!key) return { status: 503, json: { error: "Routing is not configured" } };

  const cacheKey = JSON.stringify(req);
  const cached = cache.get(cacheKey);
  if (cached) return { status: 200, json: cached };

  const { url, body: orsBody } = orsRequest(req);
  const res = await fetchFn(url, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify(orsBody),
  });
  if (!res.ok) {
    console.error(`ORS answered ${res.status}`);
    return { status: 502, json: { error: "Routing service failed" } };
  }
  const feature = ((await res.json()) as OrsGeoJson).features?.[0];
  const coords = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (!coords?.length) return { status: 502, json: { error: "Routing service returned no route" } };

  const result: RouteResponse = {
    path: coords.map(([lon, lat]) => [lat, lon]),
    distanceMetres: Math.round(summary?.distance ?? 0),
    durationSeconds: Math.round(summary?.duration ?? 0),
  };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, result);
  return { status: 200, json: result };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { status, json } = await route(body, process.env.ORS_API_KEY);
  return Response.json(json, { status });
}
