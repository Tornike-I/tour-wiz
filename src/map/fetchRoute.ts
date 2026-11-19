import type { LatLon, RouteRequest, RouteResponse } from "./routeTypes";

export type { LatLon, RouteResponse };

/** Asks our proxy for one leg. Sends only the leg's two points and the route options. */
export async function fetchRoute(req: RouteRequest, signal?: AbortSignal): Promise<RouteResponse | null> {
  try {
    const res = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    return res.ok ? ((await res.json()) as RouteResponse) : null;
  } catch {
    return null;
  }
}
