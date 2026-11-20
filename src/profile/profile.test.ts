import { describe, expect, it } from "vitest";
import {
  PROFILE_KEY,
  createProfile,
  deleteProfile,
  groupInterests,
  loadProfile,
  rate,
  saveProfile,
  walkTimeFactor,
  type Profile,
} from ".";

const teaHouse = { id: "dobra-cajovna", tags: ["tea-house"] as const };
const gallery = { id: "kampa-museum", tags: ["art", "museum", "river"] as const };

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("createProfile", () => {
  it("starts every picked interest at weight 1 and takes the walking cap from the pace", () => {
    const p = createProfile({ interests: ["art", "tea-house"], pace: "relaxed", stepFree: true });
    expect(p.interests).toEqual({ art: 1, "tea-house": 1 });
    expect(p.maxWalkKmPerDay).toBe(6);
    expect(p.stepFree).toBe(true);
    expect(p.ratings).toEqual({});
  });

  it("keeps a walking cap the traveller set", () => {
    expect(createProfile({ interests: [], pace: "brisk", stepFree: false, maxWalkKmPerDay: 4 }).maxWalkKmPerDay).toBe(4);
  });

  it("slows walking for a relaxed pace and speeds it up for a brisk one", () => {
    expect(walkTimeFactor({ pace: "relaxed" })).toBeGreaterThan(1);
    expect(walkTimeFactor({ pace: "brisk" })).toBeLessThan(1);
  });
});

describe("groupInterests", () => {
  it("averages each interest over everyone in the group", () => {
    const p = createProfile({
      interests: ["art", "tea-house"],
      pace: "normal",
      stepFree: false,
      group: [
        { name: "Ana", interests: ["tea-house"] },
        { name: "Ben", interests: ["beer"] },
      ],
    });
    expect(groupInterests(p)).toEqual({ art: 0.333, "tea-house": 0.667, beer: 0.333 });
  });

  it("is the traveller's own interests without a group", () => {
    const p = createProfile({ interests: ["art"], pace: "normal", stepFree: false });
    expect(groupInterests(p)).toBe(p.interests);
    expect(p.group).toBeUndefined();
  });

  it("rejects a group member with no interests", () => {
    expect(() =>
      createProfile({ interests: ["art"], pace: "normal", stepFree: false, group: [{ name: "Ana", interests: [] }] }),
    ).toThrow();
  });
});

describe("rate", () => {
  const base = (): Profile => createProfile({ interests: ["art"], pace: "normal", stepFree: false });

  it("raises the place's tags for 5 stars, without going over 1", () => {
    const p = rate(base(), "prague", gallery, 5);
    expect(p.interests.art).toBe(1);
    expect(p.interests.museum).toBe(0.2);
    expect(p.ratings["prague/kampa-museum"]).toBe(5);
  });

  it("lowers them for 1 star and leaves them for 3", () => {
    expect(rate(base(), "prague", gallery, 1).interests.art).toBe(0.8);
    expect(rate(base(), "prague", gallery, 3).interests.art).toBe(1);
  });

  it("adds an interest the traveller never picked", () => {
    expect(base().interests["tea-house"]).toBeUndefined();
    expect(rate(base(), "prague", teaHouse, 5).interests["tea-house"]).toBe(0.2);
  });

  it("replaces the effect of an earlier rating of the same place", () => {
    const once = rate(base(), "prague", gallery, 1);
    const changed = rate(once, "prague", gallery, 3);
    expect(changed.interests.art).toBe(1);
    expect(changed.ratings["prague/kampa-museum"]).toBe(3);
  });

  it("carries tastes to another city through the shared tags", () => {
    const p = rate(base(), "prague", teaHouse, 5);
    const barcelonaTeaHouse = { id: "some-tea-house", tags: ["tea-house"] as const };
    expect(rate(p, "barcelona", barcelonaTeaHouse, 5).interests["tea-house"]).toBe(0.4);
  });

  it("does not change the profile it was given", () => {
    const p = base();
    rate(p, "prague", gallery, 1);
    expect(p.interests.art).toBe(1);
    expect(p.ratings).toEqual({});
  });
});

describe("storage", () => {
  const profile = createProfile({ interests: ["beer"], pace: "normal", stepFree: false });

  it("saves, loads and deletes the profile", () => {
    const store = memoryStore();
    expect(saveProfile(profile, store)).toBe(true);
    expect(loadProfile(store)).toEqual(profile);
    deleteProfile(store);
    expect(store.data.has(PROFILE_KEY)).toBe(false);
    expect(loadProfile(store)).toBeNull();
  });

  it("ignores stored data that is broken or from an unknown version", () => {
    const store = memoryStore();
    store.setItem(PROFILE_KEY, "{not json");
    expect(loadProfile(store)).toBeNull();
    store.setItem(PROFILE_KEY, JSON.stringify({ ...profile, version: 99 }));
    expect(loadProfile(store)).toBeNull();
  });

  it("survives storage that throws, as in Safari private mode", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadProfile(throwing)).toBeNull();
    expect(saveProfile(profile, throwing)).toBe(false);
    expect(() => deleteProfile(throwing)).not.toThrow();
  });
});
