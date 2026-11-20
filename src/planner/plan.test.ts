import { describe, expect, it } from "vitest";
import prague from "../../data/cities/prague.json";
import { parseCity, type City, type Level, type Place, type RestPoint } from "../catalogue";
import { createProfile, rate, type OnboardingAnswers } from "../profile";
import { plan } from ".";

const flat = (level: Level): Level[] => Array.from({ length: 24 }, () => level);
// Quiet before 11:00, packed after.
const quietMorning: Level[] = flat(4).map((l, h) => (h < 11 ? 0 : l)) as Level[];
// Packed before 11:00, quiet after.
const quietLater: Level[] = flat(0).map((l, h) => (h < 11 ? 4 : l)) as Level[];

function place(id: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    osmId: "node/1",
    name: id,
    location: [50.087, 14.42],
    tags: ["art"],
    openingHours: "Mo-Su 09:00-18:00",
    visitMinutes: 60,
    crowd: { weekday: flat(1), weekend: flat(1) },
    crowdSource: "test",
    stepFree: "yes",
    ...overrides,
  };
}

// Every pair of places is `walkSeconds` apart.
function city(places: Place[], walkSeconds = 600, restPoints: RestPoint[] = []): City {
  const ids = places.map((p) => p.id);
  const seconds = ids.map((a) => ids.map((b) => (a === b ? 0 : walkSeconds)));
  return {
    id: "testville",
    name: "Testville",
    countryCode: "cz",
    timezone: "Europe/Prague",
    center: [50.087, 14.42],
    walkSource: "estimate",
    places,
    restPoints,
    walk: { ids, seconds },
    walkStepFree: { ids, seconds },
  };
}

const profile = (answers: Partial<OnboardingAnswers> = {}) =>
  createProfile({ interests: ["art"], pace: "normal", stepFree: false, ...answers });

// 2026-11-18 is a Wednesday, 2026-11-21 a Saturday.
const day = { date: "2026-11-18", start: "09:00", end: "18:00" };

describe("plan for a group", () => {
  const art = place("gallery", { tags: ["art"] });
  const tea = place("tea-room", { tags: ["tea-house"] });
  const shared = place("riverside-gallery", { tags: ["art", "tea-house"] });

  it("plans places only someone else in the group likes, and says who each is for", () => {
    const stops = plan(city([art, tea]), profile({ group: [{ name: "Ana", interests: ["tea-house"] }] }), day).stops;
    expect(stops.map((s) => s.placeId).sort()).toEqual(["gallery", "tea-room"]);
    expect(stops.find((s) => s.placeId === "tea-room")!.reasons[0]).toBe("Matches: tea-house (Ana)");
    expect(stops.find((s) => s.placeId === "gallery")!.reasons[0]).toBe("Matches: art (you)");
  });

  it("puts a place the whole group likes first", () => {
    const group = [{ name: "Ana", interests: ["tea-house" as const] }];
    const stops = plan(city([art, tea, shared]), profile({ group }), { ...day, end: "10:15" }).stops;
    expect(stops[0]!.placeId).toBe("riverside-gallery");
    expect(stops[0]!.reasons[0]).toBe("Matches: art (you), tea-house (Ana)");
  });

  it("keeps the plain reason for a traveller on their own", () => {
    expect(plan(city([art]), profile(), day).stops[0]!.reasons[0]).toBe("Matches: art");
  });
});

describe("plan", () => {
  it("returns an empty plan for a missing date or time instead of hanging", () => {
    const c = city([place("a")]);
    for (const bad of [{ date: "" }, { start: "" }, { end: "" }, { date: "not-a-date" }]) {
      expect(plan(c, profile(), { ...day, ...bad }).stops).toEqual([]);
    }
  });

  it("never plans a place while it is closed", () => {
    const c = city([place("closed-today", { openingHours: "Th 09:00-18:00" }), place("open")]);
    const ids = plan(c, profile(), day).stops.map((s) => s.placeId);
    expect(ids).toEqual(["open"]);
  });

  it("never plans a visit that runs past closing time", () => {
    const c = city([place("closes-early", { openingHours: "Mo-Su 09:00-09:30" })]);
    expect(plan(c, profile(), day).stops).toEqual([]);
  });

  it("gives a step-free traveller no place whose stepFree is no", () => {
    const c = city([place("steps", { stepFree: "no" }), place("ramp"), place("some-steps", { stepFree: "limited" })]);
    const stops = plan(c, profile({ stepFree: true }), day).stops;
    expect(stops.map((s) => s.placeId).sort()).toEqual(["ramp", "some-steps"]);
    expect(stops.find((s) => s.placeId === "some-steps")?.reasons).toContain("Step-free access is limited");
  });

  it("keeps the walking cap", () => {
    const c = city(["a", "b", "c", "d", "e"].map((id) => place(id)), 1200); // 1.56 km per leg
    const result = plan(c, profile({ maxWalkKmPerDay: 4 }), day);
    expect(result.walkedKm).toBeLessThanOrEqual(4);
    expect(result.stops.length).toBeLessThan(5);
  });

  it("prefers the quiet slot when tastes are equal", () => {
    const c = city([
      place("busy-now", { crowd: { weekday: quietLater, weekend: quietLater } }),
      place("quiet-now", { crowd: { weekday: quietMorning, weekend: quietMorning } }),
    ]);
    const stops = plan(c, profile(), day).stops;
    expect(stops.map((s) => s.placeId)).toEqual(["quiet-now", "busy-now"]);
    expect(stops.every((s) => s.crowdLevel === 0)).toBe(true);
  });

  it("says when it waits for a place to open", () => {
    const c = city([place("late-opener", { openingHours: "Mo-Su 10:00-18:00" })]);
    const stop = plan(c, profile(), day).stops[0];
    expect(stop?.arrive).toBe("10:00");
    expect(stop?.reasons).toContain("Waits 60 min for it to open");
  });

  it("waits for a quieter slot when one is close", () => {
    const quietAt10: Level[] = flat(4).map((l, h) => (h === 10 || h === 11 ? 0 : l)) as Level[];
    const c = city([place("museum", { crowd: { weekday: quietAt10, weekend: quietAt10 } })]);
    const stop = plan(c, profile(), { ...day, start: "09:30" }).stops[0];
    expect(stop?.arrive).toBe("10:00");
    expect(stop?.crowdLevel).toBe(0);
    expect(stop?.reasons.join()).toMatch(/for a quieter slot/);
  });

  it("uses the weekend curve on a Saturday", () => {
    const busyWeekend = place("museum", { crowd: { weekday: flat(0), weekend: flat(4) } });
    expect(plan(city([busyWeekend]), profile(), { ...day, date: "2026-11-21" }).stops[0]?.crowdLevel).toBe(4);
    expect(plan(city([busyWeekend]), profile(), day).stops[0]?.crowdLevel).toBe(0);
  });

  it("leaves out places the traveller rated 1 star or has no interest in", () => {
    const c = city([place("disliked"), place("liked"), place("pub", { tags: ["beer"] })]);
    const p = rate(profile(), "testville", { id: "disliked", tags: ["art"] }, 1);
    expect(plan(c, p, day).stops.map((s) => s.placeId)).toEqual(["liked"]);
  });

  it("fits the whole day between start and end", () => {
    const c = city(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((id) => place(id)));
    const stops = plan(c, profile(), { ...day, start: "10:00", end: "14:00" }).stops;
    expect(stops[0]!.arrive >= "10:00").toBe(true);
    expect(stops.at(-1)!.leave <= "14:00").toBe(true);
  });

  it("explains every stop", () => {
    const stops = plan(city([place("a"), place("b")]), profile(), day).stops;
    for (const stop of stops) {
      expect(stop.reasons[0]).toBe("Matches: art");
      expect(stop.reasons[1]).toMatch(/^Quiet at \d\d:\d\d \(quiet, level 1 of 4\)$/);
    }
  });

  it("mixes interests instead of repeating one tag all day", () => {
    const c = city([
      place("gallery-1", { tags: ["art"] }),
      place("gallery-2", { tags: ["art"] }),
      place("gallery-3", { tags: ["art"] }),
      place("tea", { tags: ["tea-house"] }),
    ]);
    const stops = plan(c, profile({ interests: ["art", "tea-house"] }), { ...day, end: "13:00" }).stops;
    expect(stops.map((s) => s.placeId)).toContain("tea");
  });

  describe("rest stops", () => {
    // Two places 1.4 km apart on a north-south line; the leg takes 20 minutes.
    const north = place("north", { location: [50.1, 14.42], openingHours: "24/7" });
    const south = place("south", { location: [50.0874, 14.42], openingHours: "24/7" });
    const onTheWay: RestPoint = { location: [50.094, 14.4202], kind: "bench" };
    const farAway: RestPoint = { location: [50.094, 14.45], kind: "bench" };
    const cafe: RestPoint = { location: [50.094, 14.4201], kind: "cafe" };
    const walk = { ...day, from: [50.1, 14.42] as [number, number] };

    it("adds a rest on a leg longer than the traveller's limit, at the point with the least detour", () => {
      const c = city([south], 1200, [farAway, onTheWay]);
      const stop = plan(c, profile({ restEveryMinutes: 15 }), walk).stops[0]!;
      expect(stop.rest).toEqual({ kind: "bench", location: onTheWay.location, minutes: 10 });
      expect(stop.reasons).toContain("Rest on the way at a bench (10 min)");
    });

    it("rests near where the limit runs out, not right at the start", () => {
      const atStart: RestPoint = { location: [50.0999, 14.4201], kind: "bench" };
      const c = city([south], 1200, [atStart, onTheWay]);
      expect(plan(c, profile({ restEveryMinutes: 15 }), walk).stops[0]!.rest?.location).toEqual(onTheWay.location);
    });

    it("counts the rest in the arrival time", () => {
      const c = city([south], 1200, [onTheWay]);
      const without = plan(c, profile(), walk).stops[0]!;
      const withRest = plan(c, profile({ restEveryMinutes: 15 }), walk).stops[0]!;
      expect(toMinutes(withRest.arrive) - toMinutes(without.arrive)).toBeGreaterThanOrEqual(10);
    });

    it("adds no rest on short legs or when the traveller needs none", () => {
      const c = city([north, south], 600, [onTheWay]);
      expect(plan(c, profile({ restEveryMinutes: 30 }), walk).stops.every((s) => !s.rest)).toBe(true);
      expect(plan(city([south], 1200, [onTheWay]), profile(), walk).stops[0]!.rest).toBeUndefined();
    });

    it("rests a step-free traveller only at benches", () => {
      const c = city([south], 1200, [cafe, farAway]);
      expect(plan(c, profile({ restEveryMinutes: 15, stepFree: true }), walk).stops[0]!.rest?.kind).toBe("bench");
      expect(plan(c, profile({ restEveryMinutes: 15 }), walk).stops[0]!.rest?.kind).toBe("cafe");
    });
  });

  it("plans a full Prague day from the real catalogue", () => {
    const p = profile({ interests: ["castle", "art", "viewpoint", "tea-house"] });
    const result = plan(parseCity(prague), p, day);
    expect(result.stops.length).toBeGreaterThanOrEqual(4);
    expect(new Set(result.stops.map((s) => s.placeId)).size).toBe(result.stops.length);
    expect(result.walkedKm).toBeLessThanOrEqual(p.maxWalkKmPerDay);
  });
});

function toMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number) as [number, number];
  return h * 60 + m;
}
