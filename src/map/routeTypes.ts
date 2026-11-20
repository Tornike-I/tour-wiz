// Shared by the app and the /api/route proxy.
export type LatLon = [lat: number, lon: number];
export type RouteRequest = { from: LatLon; to: LatLon; scenic: number; stepFree: boolean };
export type RouteResponse = { path: LatLon[]; distanceMetres: number; durationSeconds: number };
