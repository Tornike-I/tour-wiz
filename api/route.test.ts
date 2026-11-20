import { describe, expect, it, vi } from "vitest";
import { orsRequest, parseRouteRequest, route } from "./route";

const leg = { from: [50.08654, 14.41144], to: [50.0909, 14.40055], scenic: 0.6, stepFree: false };

const orsOk = () =>
  vi.fn(async () =>
    Response.json({
      features: [
        {
          geometry: { coordinates: [[14.41144, 50.08654], [14.405, 50.089], [14.40055, 50.0909]] },
          properties: { summary: { distance: 1234.4, duration: 901.6 } },
        },
      ],
    }),
  );

describe("parseRouteRequest", () => {
  it("rounds the points and snaps scenic to quarter steps", () => {
    expect(parseRouteRequest({ ...leg, from: [50.0865412, 14.4114433], scenic: 0.6 })).toEqual({
      ...leg,
      from: [50.08654, 14.41144],
      scenic: 0.5,
    });
  });

  it("refuses points outside the city and malformed bodies", () => {
    expect(parseRouteRequest({ ...leg, to: [48.85, 2.35] })).toMatch(/inside the city/);
    expect(parseRouteRequest({ ...leg, scenic: 2 })).toMatch(/scenic/);
    expect(parseRouteRequest({ ...leg, stepFree: "yes" })).toMatch(/stepFree/);
    expect(parseRouteRequest(null)).toMatch(/from and to/);
  });
});

describe("orsRequest", () => {
  it("adds green and quiet weightings for a scenic walking leg", () => {
    const { url, body } = orsRequest({ ...leg, from: [50.1, 14.4], to: [50.2, 14.5], scenic: 0.5 } as never);
    expect(url).toMatch(/\/foot-walking\/geojson$/);
    expect(body).toEqual({
      coordinates: [[14.4, 50.1], [14.5, 50.2]],
      options: { profile_params: { weightings: { green: 0.5, quiet: 0.5 } } },
    });
  });

  it("uses the wheelchair profile without weightings when step-free", () => {
    const { url, body } = orsRequest({ ...leg, stepFree: true } as never);
    expect(url).toMatch(/\/wheelchair\/geojson$/);
    expect(body).not.toHaveProperty("options");
  });

  it("asks for the plain fastest route at scenic 0", () => {
    expect(orsRequest({ ...leg, scenic: 0 } as never).body).not.toHaveProperty("options");
  });
});

describe("route", () => {
  it("returns the path as [lat, lon] with distance and duration", async () => {
    const result = await route(leg, "key", orsOk());
    expect(result.status).toBe(200);
    expect(result.json).toEqual({
      path: [[50.08654, 14.41144], [50.089, 14.405], [50.0909, 14.40055]],
      distanceMetres: 1234,
      durationSeconds: 902,
    });
  });

  it("sends the key only to ORS and caches repeated legs", async () => {
    const fetchFn = orsOk();
    const repeated = { ...leg, from: [50.08655, 14.41145] };
    await route(repeated, "secret", fetchFn);
    await route(repeated, "secret", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.heigit\.org\/openrouteservice\/v2\/directions\//);
    expect((init.headers as Record<string, string>).Authorization).toBe("secret");
  });

  it("says when no key is configured, and rejects bad input before calling ORS", async () => {
    const fetchFn = orsOk();
    expect((await route(leg, undefined, fetchFn)).status).toBe(503);
    expect((await route({ ...leg, to: [0, 0] }, "key", fetchFn)).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports an ORS failure without passing its details on", async () => {
    const failing = vi.fn(async () => new Response("quota", { status: 429 }));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await route({ ...leg, scenic: 0.25 }, "key", failing);
    expect(result).toEqual({ status: 502, json: { error: "Routing service failed" } });
    expect(errorLog.mock.calls.flat().join(" ")).not.toMatch(/50\.\d|14\.\d/);
    errorLog.mockRestore();
  });
});
