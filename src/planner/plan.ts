import OpeningHours from "opening_hours";
import type { City, Level, Place, RestPoint } from "../catalogue";
import type { Tag } from "../catalogue/tags";
import { groupInterests, walkTimeFactor, ratingKey, type Profile } from "../profile";

/** Weights of the value formula. Tuned by hand against Prague; see TECH.md. */
export const WEIGHTS = {
  crowd: 0.6, // per crowd level 0..4, scaled to 0..1
  walk: 0.6, // per 30 minutes of walking
  wait: 0.25, // per hour of waiting for a quieter slot
  repeat: 0.5, // a tag's weight is multiplied by this for each earlier stop that had it
};

const WAIT_OPTIONS = [0, 30, 60]; // minutes
const SLOT_MINUTES = 15;
// Converts matrix seconds to distance for the walking cap; the catalogue stores times, not distances.
const WALK_METRES_PER_SECOND = 1.3;
export const REST_MINUTES = 10;
const REST_LABELS: Record<RestPoint["kind"], string> = { bench: "a bench", cafe: "a café", toilets: "public toilets" };

export type PlanRequest = {
  date: string; // "2026-11-21", the city's local date
  start: string; // "09:00", local time
  end: string; // "18:00"
  from?: [lat: number, lon: number]; // where the day starts; defaults to the city centre
};

export type Stop = {
  placeId: string;
  name: string;
  arrive: string;
  leave: string;
  walkMinutes: number;
  waitMinutes: number;
  crowdLevel: Level;
  rest?: { kind: RestPoint["kind"]; location: [lat: number, lon: number]; minutes: number }; // on the way here
  reasons: string[];
};

export type DayPlan = {
  stops: Stop[];
  walkedKm: number;
  quietShare: number; // share of stops at crowd level 0 or 1
};

/** Builds one day greedily: from where the traveller is, add the best next stop until nothing fits. */
export function plan(city: City, profile: Profile, request: PlanRequest): DayPlan {
  const [year, month, day] = request.date.split("-").map(Number) as [number, number, number];
  // Dates carry the city's wall-clock time in local fields, which is what opening_hours reads.
  const at = (minutes: number) => new Date(year, month - 1, day, 0, minutes);
  const dayType = [0, 6].includes(at(0).getDay()) ? "weekend" : "weekday";
  const endMinutes = toMinutes(request.end);
  // A cleared date or time field would otherwise make the search loop forever on NaN.
  if (Number.isNaN(at(0).getTime()) || !Number.isFinite(toMinutes(request.start)) || !Number.isFinite(endMinutes)) {
    return { stops: [], walkedKm: 0, quietShare: 0 };
  }

  const matrix = profile.stepFree ? city.walkStepFree : city.walk;
  const index = new Map(matrix.ids.map((id, i) => [id, i]));
  const paceFactor = walkTimeFactor(profile);
  const nominatim = { lat: city.center[0], lon: city.center[1], address: { country_code: city.countryCode, state: "" } };
  const hours = new Map(city.places.map((p) => [p.id, new OpeningHours(p.openingHours, nominatim)]));

  const legSeconds = (from: Place | [number, number], to: Place): number => {
    const seconds = Array.isArray(from)
      ? (metres(from, to.location) * 1.3) / WALK_METRES_PER_SECOND
      : (matrix.seconds[index.get(from.id)!]?.[index.get(to.id)!] ?? Infinity);
    return seconds * paceFactor;
  };

  // Benches only for step-free travellers: OSM rarely says whether a café or toilet has steps.
  const restPoints = city.restPoints.filter((r) => !profile.stepFree || r.kind === "bench");

  /** A leg longer than the traveller's rest limit gets a rest near where the limit runs out, with a small detour. */
  const restFor = (from: Place | [number, number], to: Place, walkMinutes: number) => {
    if (!profile.restEveryMinutes || walkMinutes <= profile.restEveryMinutes) return undefined;
    const a = Array.isArray(from) ? from : from.location;
    const direct = metres(a, to.location);
    const share = Math.min(profile.restEveryMinutes / walkMinutes, 0.8);
    const target: [number, number] = [a[0] + (to.location[0] - a[0]) * share, a[1] + (to.location[1] - a[1]) * share];
    let best: { point: RestPoint; detour: number; score: number } | undefined;
    for (const point of restPoints) {
      const detour = metres(a, point.location) + metres(point.location, to.location) - direct;
      const score = detour + metres(point.location, target);
      if (!best || score < best.score) best = { point, detour, score };
    }
    return best && { point: best.point, detourSeconds: ((best.detour * 1.3) / WALK_METRES_PER_SECOND) * paceFactor };
  };

  const openThroughout = (place: Place, arrive: number, leave: number): boolean => {
    const oh = hours.get(place.id)!;
    if (!oh.getState(at(arrive))) return false;
    const change = oh.getNextChange(at(arrive), at(leave));
    return change === undefined || change >= at(leave);
  };

  const crowdDuring = (place: Place, arrive: number, leave: number): Level => {
    const curve = place.crowd[dayType];
    let worst: Level = 0;
    for (let m = arrive; m < leave; m += 60) worst = Math.max(worst, curve[Math.floor(m / 60) % 24] ?? 0) as Level;
    return worst;
  };

  const interests = groupInterests(profile);
  const candidates = city.places.filter(
    (p) =>
      profile.ratings[ratingKey(city.id, p.id)] !== 1 &&
      !(profile.stepFree && p.stepFree === "no") &&
      tasteOf(p, interests, new Map()) > 0,
  );
  const maxTaste = Math.max(...candidates.map((p) => tasteOf(p, interests, new Map())), 1);

  const stops: Stop[] = [];
  const seenTags = new Map<Tag, number>();
  let now = roundUp(toMinutes(request.start));
  let position: Place | [number, number] = request.from ?? city.center;
  let walkedMetres = 0;
  const capMetres = profile.maxWalkKmPerDay * 1000;
  const remaining = new Set(candidates);

  for (;;) {
    let best:
      | {
          place: Place;
          value: number;
          arrive: number;
          wait: number;
          walk: number;
          crowd: Level;
          closedOnArrival: boolean;
          rest?: RestPoint;
          metres: number;
        }
      | undefined;
    for (const place of remaining) {
      const directSeconds = legSeconds(position, place);
      if (!Number.isFinite(directSeconds)) continue;
      const rest = restFor(position, place, Math.ceil(directSeconds / 60));
      const walkSeconds = directSeconds + (rest?.detourSeconds ?? 0);
      const walkMinutes = Math.ceil(walkSeconds / 60);
      const legMetres = (walkSeconds / paceFactor) * WALK_METRES_PER_SECOND;
      if (walkedMetres + legMetres > capMetres) continue;
      const taste = tasteOf(place, interests, seenTags) / maxTaste;
      const firstSlot = roundUp(now + walkMinutes + (rest ? REST_MINUTES : 0));
      const closedOnArrival = !hours.get(place.id)!.getState(at(firstSlot));
      const waits = [...WAIT_OPTIONS];
      if (closedOnArrival) {
        const opens = hours.get(place.id)!.getNextChange(at(firstSlot), at(firstSlot + 90));
        if (opens) waits.push(Math.round((opens.getTime() - at(firstSlot).getTime()) / 60_000));
      }
      for (const wait of waits) {
        const arrive = firstSlot + wait;
        const leave = arrive + place.visitMinutes;
        if (leave > endMinutes || !openThroughout(place, arrive, leave)) continue;
        const crowd = crowdDuring(place, arrive, leave);
        const value =
          taste -
          (WEIGHTS.crowd * crowd) / 4 -
          (WEIGHTS.walk * walkMinutes) / 30 -
          (WEIGHTS.wait * wait) / 60;
        if (!best || value > best.value) {
          best = { place, value, arrive, wait, walk: walkMinutes, crowd, closedOnArrival, rest: rest?.point, metres: legMetres };
        }
      }
    }
    if (!best) break;

    const { place, arrive, wait, walk, crowd, closedOnArrival, rest } = best;
    const leave = arrive + place.visitMinutes;
    stops.push({
      placeId: place.id,
      name: place.name,
      arrive: toClock(arrive),
      leave: toClock(leave),
      walkMinutes: walk,
      waitMinutes: wait,
      crowdLevel: crowd,
      ...(rest ? { rest: { kind: rest.kind, location: rest.location, minutes: REST_MINUTES } } : {}),
      reasons: [
        ...reasonsFor(place, profile, crowd, arrive, wait, closedOnArrival),
        ...(rest ? [`Rest on the way at ${REST_LABELS[rest.kind]} (${REST_MINUTES} min)`] : []),
      ],
    });
    for (const tag of place.tags) seenTags.set(tag, (seenTags.get(tag) ?? 0) + 1);
    walkedMetres += best.metres;
    remaining.delete(place);
    position = place;
    now = leave;
  }

  return {
    stops,
    walkedKm: Math.round(walkedMetres / 100) / 10,
    quietShare: stops.length ? stops.filter((s) => s.crowdLevel <= 1).length / stops.length : 0,
  };
}

function tasteOf(place: Place, interests: Profile["interests"], seenTags: Map<Tag, number>): number {
  return place.tags.reduce(
    (sum, tag) => sum + (interests[tag] ?? 0) * WEIGHTS.repeat ** (seenTags.get(tag) ?? 0),
    0,
  );
}

/** "history, art" alone, or "history (you, Ana), art (Ben)" when travelling as a group. */
function matchesFor(place: Place, profile: Profile): string {
  const group = profile.group ?? [];
  return place.tags
    .map((tag) => {
      const who = [
        ...((profile.interests[tag] ?? 0) > 0 ? ["you"] : []),
        ...group.filter((m) => m.interests.includes(tag)).map((m) => m.name),
      ];
      if (who.length === 0) return undefined;
      return group.length ? `${tag} (${who.join(", ")})` : tag;
    })
    .filter(Boolean)
    .join(", ");
}

function reasonsFor(
  place: Place,
  profile: Profile,
  crowd: Level,
  arrive: number,
  wait: number,
  closedOnArrival: boolean,
): string[] {
  const reasons = [`Matches: ${matchesFor(place, profile)}`];
  const label = ["empty", "quiet", "moderate", "busy", "packed"][crowd];
  reasons.push(`${crowd <= 1 ? "Quiet" : "Crowd"} at ${toClock(arrive)} (${label}, level ${crowd} of 4)`);
  if (wait > 0) reasons.push(closedOnArrival ? `Waits ${wait} min for it to open` : `Waits ${wait} min for a quieter slot`);
  if (profile.stepFree && place.stepFree === "limited") reasons.push("Step-free access is limited");
  return reasons;
}

function toMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

function toClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function roundUp(minutes: number): number {
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function metres(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
