import { citySchema, type City } from "./schema";

export { citySchema, placeSchema, restPointSchema } from "./schema";
export type { City, Place, RestPoint, Level } from "./schema";
export { TAGS, type Tag } from "./tags";
export { isInCity, metres } from "./area";

export class CatalogueError extends Error {}

export function parseCity(data: unknown): City {
  const result = citySchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new CatalogueError(`Invalid city catalogue:\n${issues}`);
  }
  return result.data;
}

export type WalkTimes = (fromId: string, toId: string) => number;

export function walkTimes(city: City, stepFree: boolean): WalkTimes {
  const matrix = stepFree ? city.walkStepFree : city.walk;
  const index = new Map(matrix.ids.map((id, i) => [id, i]));
  return (fromId, toId) => {
    const from = index.get(fromId);
    const to = index.get(toId);
    const seconds = from === undefined || to === undefined ? undefined : matrix.seconds[from]?.[to];
    if (seconds === undefined) {
      throw new CatalogueError(`No walking time from "${fromId}" to "${toId}" in ${city.id}`);
    }
    return seconds;
  };
}
