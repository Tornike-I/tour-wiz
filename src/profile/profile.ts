import { z } from "zod";
import { TAGS, type Tag } from "../catalogue/tags";

export const PACES = {
  relaxed: { walkTimeFactor: 1.25, maxWalkKmPerDay: 6 },
  normal: { walkTimeFactor: 1, maxWalkKmPerDay: 10 },
  brisk: { walkTimeFactor: 0.85, maxWalkKmPerDay: 14 },
} as const;

export type Pace = keyof typeof PACES;
export type Stars = 1 | 2 | 3 | 4 | 5;

const stars = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

export const profileSchema = z.object({
  version: z.literal(1),
  interests: z.partialRecord(z.enum(TAGS), z.number().min(0).max(1)),
  pace: z.enum(["relaxed", "normal", "brisk"]),
  maxWalkKmPerDay: z.number().positive().max(40),
  stepFree: z.boolean(),
  restEveryMinutes: z.number().int().positive().optional(),
  ratings: z.record(z.string(), stars), // key: "<cityId>/<placeId>"
});

export type Profile = z.infer<typeof profileSchema>;

export type OnboardingAnswers = {
  interests: Tag[];
  pace: Pace;
  stepFree: boolean;
  maxWalkKmPerDay?: number;
  restEveryMinutes?: number;
};

export function createProfile(answers: OnboardingAnswers): Profile {
  return profileSchema.parse({
    version: 1,
    interests: Object.fromEntries(answers.interests.map((tag) => [tag, 1])),
    pace: answers.pace,
    maxWalkKmPerDay: answers.maxWalkKmPerDay ?? PACES[answers.pace].maxWalkKmPerDay,
    stepFree: answers.stepFree,
    ...(answers.restEveryMinutes ? { restEveryMinutes: answers.restEveryMinutes } : {}),
    ratings: {},
  });
}

// How far one rating moves each of the place's tag weights: 5 stars +0.2, 3 stars nothing, 1 star −0.2.
export const RATING_STEP = 0.2;
const shift = (s: Stars) => (RATING_STEP * (s - 3)) / 2;

export function ratingKey(cityId: string, placeId: string): string {
  return `${cityId}/${placeId}`;
}

/**
 * Records a rating and moves the weights of the place's tags. Tags the traveller never picked start
 * at 0, so a high rating can add a new interest. Re-rating a place replaces the earlier rating's effect.
 */
export function rate(
  profile: Profile,
  cityId: string,
  place: { id: string; tags: readonly Tag[] },
  rating: Stars,
): Profile {
  const key = ratingKey(cityId, place.id);
  const previous = profile.ratings[key];
  const delta = shift(rating) - (previous ? shift(previous) : 0);
  const interests = { ...profile.interests };
  for (const tag of place.tags) {
    interests[tag] = round(Math.min(1, Math.max(0, (interests[tag] ?? 0) + delta)));
  }
  return { ...profile, interests, ratings: { ...profile.ratings, [key]: rating } };
}

export function walkTimeFactor(profile: Pick<Profile, "pace">): number {
  return PACES[profile.pace].walkTimeFactor;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
