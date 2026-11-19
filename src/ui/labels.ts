import type { Tag } from "../catalogue/tags";
import type { Pace } from "../profile";

export const TAG_LABELS: Record<Tag, string> = {
  castle: "Castles",
  church: "Churches",
  museum: "Museums",
  art: "Art",
  history: "History",
  architecture: "Architecture",
  viewpoint: "Viewpoints",
  park: "Parks and gardens",
  river: "By the river",
  "tea-house": "Tea houses",
  cafe: "Cafés",
  beer: "Beer and pubs",
  "food-market": "Food markets",
  nightlife: "Nightlife",
  music: "Live music",
  kids: "For kids",
  shopping: "Shopping",
};

export const PACE_LABELS: Record<Pace, { name: string; hint: string }> = {
  relaxed: { name: "Relaxed", hint: "Slower walks, more time between stops" },
  normal: { name: "Normal", hint: "Average walking speed" },
  brisk: { name: "Brisk", hint: "Fast walks, more stops in a day" },
};

export const CROWD_LABELS = ["Empty", "Quiet", "Moderate", "Busy", "Packed"] as const;
