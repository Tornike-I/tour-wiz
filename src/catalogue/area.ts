import type { City } from "./schema";

const MARGIN_METRES = 2_000;

export function metres(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** True when the point is no further from the centre than the city's furthest place, plus a short walk. */
export function isInCity(city: City, point: [number, number]): boolean {
  const radius = Math.max(...city.places.map((p) => metres(city.center, p.location))) + MARGIN_METRES;
  return metres(city.center, point) <= radius;
}
