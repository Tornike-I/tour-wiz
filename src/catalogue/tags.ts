// The shared tag vocabulary. Every city uses only these tags, so a taste
// profile built in one city carries over to the next. Never add a tag that
// fits only one city.
export const TAGS = [
  "castle",
  "church",
  "museum",
  "art",
  "history",
  "architecture",
  "viewpoint",
  "park",
  "river",
  "tea-house",
  "cafe",
  "beer",
  "food-market",
  "nightlife",
  "music",
  "kids",
  "shopping",
] as const;

export type Tag = (typeof TAGS)[number];
