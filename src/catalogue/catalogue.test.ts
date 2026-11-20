import { describe, expect, it } from "vitest";
import prague from "../../data/cities/prague.json";
import { CatalogueError, isInCity, parseCity, walkTimes, type City } from ".";

const valid = (): City => structuredClone(prague) as City;

describe("city catalogue", () => {
  it("accepts the committed Prague catalogue", () => {
    const city = parseCity(prague);
    expect(city.places.length).toBeGreaterThanOrEqual(30);
    expect(city.places.length).toBeLessThanOrEqual(50);
  });

  it("rejects invalid opening hours", () => {
    const city = valid();
    city.places[0]!.openingHours = "Apr 01-31 09:00-17:00";
    expect(() => parseCity(city)).toThrow(/openingHours/);
  });

  it("rejects tags outside the shared vocabulary", () => {
    const city = valid() as unknown as { places: { tags: string[] }[] };
    city.places[0]!.tags = ["prague-only-thing"];
    expect(() => parseCity(city)).toThrow(CatalogueError);
  });

  it("rejects crowd curves that are not 24 hours long", () => {
    const city = valid();
    city.places[0]!.crowd.weekday = city.places[0]!.crowd.weekday.slice(0, 23);
    expect(() => parseCity(city)).toThrow(/crowd/);
  });

  it("rejects duplicate place ids", () => {
    const city = valid();
    city.places[1]!.id = city.places[0]!.id;
    expect(() => parseCity(city)).toThrow(/unique/);
  });

  it("rejects a matrix that does not cover every place", () => {
    const city = valid();
    city.walk.ids = city.walk.ids.slice(1);
    expect(() => parseCity(city)).toThrow(/walk\.ids/);
  });

  it("rejects a matrix that is not square", () => {
    const city = valid();
    city.walkStepFree.seconds = city.walkStepFree.seconds.slice(1);
    expect(() => parseCity(city)).toThrow(/walkStepFree\.seconds/);
  });

  it("looks up walking times by place id", () => {
    const city = parseCity(prague);
    const walk = walkTimes(city, false);
    expect(walk("charles-bridge", "charles-bridge")).toBe(0);
    expect(walk("charles-bridge", "prague-castle")).toBeGreaterThan(0);
    expect(() => walk("charles-bridge", "nowhere")).toThrow(CatalogueError);
  });
});

describe("isInCity", () => {
  const city = parseCity(prague);

  it("accepts the old town and the furthest catalogue place", () => {
    expect(isInCity(city, [50.0875, 14.4213])).toBe(true);
    const furthest = city.places.reduce((a, b) =>
      Math.hypot(b.location[0] - city.center[0], b.location[1] - city.center[1]) >
      Math.hypot(a.location[0] - city.center[0], a.location[1] - city.center[1])
        ? b
        : a,
    );
    expect(isInCity(city, furthest.location)).toBe(true);
  });

  it("rejects a point in another city", () => {
    expect(isInCity(city, [49.1951, 16.6068])).toBe(false); // Brno
  });
});
