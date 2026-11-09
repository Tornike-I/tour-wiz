import { z } from "zod";
import OpeningHours from "opening_hours";
import { TAGS } from "./tags";

const latLon = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);

const level = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

const hourlyLevels = z.array(level).length(24);

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lower-case-with-dashes");

export const placeSchema = z.object({
  id: slug,
  osmId: z.string().regex(/^(node|way|relation)\/\d+$/, 'use "node/123", "way/123" or "relation/123"'),
  name: z.string().min(1),
  location: latLon,
  tags: z.array(z.enum(TAGS)).min(1),
  openingHours: z.string().min(1),
  visitMinutes: z.number().int().positive().max(8 * 60),
  crowd: z.object({ weekday: hourlyLevels, weekend: hourlyLevels }),
  crowdSource: z.string().min(1),
  stepFree: z.enum(["yes", "limited", "no"]),
  url: z.url().optional(),
});

export const restPointSchema = z.object({
  location: latLon,
  kind: z.enum(["bench", "cafe", "toilets"]),
});

const walkMatrixSchema = z.object({
  ids: z.array(z.string()),
  seconds: z.array(z.array(z.number().nonnegative())),
});

export const citySchema = z
  .object({
    id: slug,
    name: z.string().min(1),
    countryCode: z.string().regex(/^[a-z]{2}$/, "ISO 3166-1 alpha-2, lower case"),
    timezone: z.string().min(1),
    center: latLon,
    walkSource: z.enum(["openrouteservice", "estimate"]),
    places: z.array(placeSchema).min(1),
    restPoints: z.array(restPointSchema),
    walk: walkMatrixSchema,
    walkStepFree: walkMatrixSchema,
  })
  .superRefine((city, ctx) => {
    const ids = city.places.map((p) => p.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["places"], message: "place ids must be unique" });
    }

    city.places.forEach((place, i) => {
      try {
        new OpeningHours(place.openingHours, {
          lat: place.location[0],
          lon: place.location[1],
          address: { country_code: city.countryCode, state: "" },
        });
      } catch (err) {
        ctx.addIssue({
          code: "custom",
          path: ["places", i, "openingHours"],
          message: `invalid opening_hours: ${String(err)}`,
        });
      }
    });

    for (const key of ["walk", "walkStepFree"] as const) {
      const matrix = city[key];
      const sameIds =
        matrix.ids.length === unique.size && matrix.ids.every((id) => unique.has(id));
      if (!sameIds) {
        ctx.addIssue({ code: "custom", path: [key, "ids"], message: "must list every place id exactly once" });
      }
      const n = matrix.ids.length;
      const square =
        matrix.seconds.length === n && matrix.seconds.every((row) => row.length === n);
      if (!square) {
        ctx.addIssue({ code: "custom", path: [key, "seconds"], message: `must be a ${n} × ${n} matrix` });
      }
    }
  });

export type City = z.infer<typeof citySchema>;
export type Place = z.infer<typeof placeSchema>;
export type RestPoint = z.infer<typeof restPointSchema>;
export type Level = z.infer<typeof level>;
