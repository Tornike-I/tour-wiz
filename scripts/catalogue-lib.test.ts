import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_SOURCE,
  checkMatrix,
  mergePlace,
  parseCrowdCsv,
  pickRestPoints,
  type OsmElement,
  type SeedPlace,
} from "./catalogue-lib";

const hours = (v: number) => Array.from({ length: 24 }, () => v).join(",");
const HEADER = "placeId,dayType," + Array.from({ length: 24 }, (_, h) => `h${String(h).padStart(2, "0")}`).join(",") + ",source";

const seed: SeedPlace = { id: "tower", osmId: "way/1", name: "Tower", tags: ["viewpoint"], visitMinutes: 30 };
const osm: OsmElement = {
  type: "way",
  id: 1,
  center: { lat: 50.1, lon: 14.4 },
  tags: { opening_hours: "Mo-Su 09:00-18:00", wheelchair: "yes" },
};

describe("parseCrowdCsv", () => {
  it("reads weekday and weekend rows with their source", () => {
    const csv = `# comment\n${HEADER}\ntower,weekday,${hours(1)},our count 9 Nov\ntower,weekend,${hours(3)},our count 9 Nov`;
    const row = parseCrowdCsv(csv).get("tower");
    expect(row?.weekday?.[10]).toBe(1);
    expect(row?.weekend?.[10]).toBe(3);
    expect(row?.source).toBe("our count 9 Nov");
  });

  it("keeps commas inside a quoted source", () => {
    const csv = `${HEADER}\ntower,weekday,${hours(1)},"count, 9 Nov"`;
    expect(parseCrowdCsv(csv).get("tower")?.source).toBe("count, 9 Nov");
  });

  it("rejects rows without a source or with bad levels", () => {
    expect(() => parseCrowdCsv(`${HEADER}\ntower,weekday,${hours(1)},`)).toThrow(/source/);
    expect(() => parseCrowdCsv(`${HEADER}\ntower,weekday,${hours(5)},x`)).toThrow(/0 to 4/);
  });
});

describe("mergePlace", () => {
  it("takes hours and step-free access from OSM", () => {
    const { place, errors } = mergePlace(seed, osm, undefined);
    expect(errors).toEqual([]);
    expect(place?.openingHours).toBe("Mo-Su 09:00-18:00");
    expect(place?.stepFree).toBe("yes");
  });

  it("lets the seed override OSM", () => {
    const { place } = mergePlace({ ...seed, openingHours: "24/7", stepFree: "limited" }, osm, undefined);
    expect(place?.openingHours).toBe("24/7");
    expect(place?.stepFree).toBe("limited");
  });

  it("treats a place with no wheelchair tag as not step-free", () => {
    const { place, warnings } = mergePlace(seed, { ...osm, tags: { opening_hours: "24/7" } }, undefined);
    expect(place?.stepFree).toBe("no");
    expect(warnings.join()).toMatch(/not step-free/);
  });

  it("labels the placeholder crowd curve", () => {
    expect(mergePlace(seed, osm, undefined).place?.crowdSource).toBe(PLACEHOLDER_SOURCE);
  });

  it("fails when hours are missing everywhere or the element is gone", () => {
    expect(mergePlace(seed, { ...osm, tags: {} }, undefined).errors.join()).toMatch(/opening_hours/);
    expect(mergePlace(seed, undefined, undefined).errors.join()).toMatch(/not found/);
  });
});

describe("checkMatrix", () => {
  it("rounds seconds and rejects unreachable pairs", () => {
    expect(checkMatrix(["a", "b"], [[0, 10.6], [9.4, 0]], "walk")).toEqual([[0, 11], [9, 0]]);
    expect(() => checkMatrix(["a", "b"], [[0, null], [9, 0]], "wheelchair")).toThrow(/a → b/);
  });
});

describe("pickRestPoints", () => {
  it("keeps the nearest points of each kind without duplicates", () => {
    const bench = (id: number, lat: number): OsmElement => ({ type: "node", id, lat, lon: 14.4, tags: { amenity: "bench" } });
    const points = pickRestPoints(
      [{ location: [50.1, 14.4] }, { location: [50.1001, 14.4] }],
      [bench(1, 50.1), bench(2, 50.1002), bench(3, 50.2)],
      2,
    );
    expect(points).toHaveLength(2);
    expect(points.every((p) => p.kind === "bench")).toBe(true);
  });
});
