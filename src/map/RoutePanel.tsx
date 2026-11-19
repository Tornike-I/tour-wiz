import { useEffect, useState } from "react";
import { DayMap } from "./DayMap";
import { fetchRoute } from "./fetchRoute";
import type { LatLon, RouteResponse } from "./routeTypes";

const SCENIC_LABELS = ["Fastest", "A little greener", "Balanced", "Greener", "Most scenic"];
const navButton =
  "min-h-11 min-w-11 rounded-lg border border-stone-300 bg-white px-3 font-medium disabled:opacity-40";

type Props = {
  start: LatLon;
  stops: { name: string; location: LatLon; walkMinutes: number; rest?: LatLon }[];
  selected: number;
  onSelect: (index: number) => void;
  stepFree: boolean;
};

export function RoutePanel({ start, stops, selected, onSelect, stepFree }: Props) {
  const [scenic, setScenic] = useState(0);
  const [route, setRoute] = useState<{ key: string; result: RouteResponse | null } | null>(null);
  const effectiveScenic = stepFree ? 0 : scenic;
  const from = selected === 0 ? start : stops[selected - 1]!.location;
  const to = stops[selected]!.location;
  const key = JSON.stringify([from, to, effectiveScenic, stepFree]);

  useEffect(() => {
    const controller = new AbortController();
    // Waits briefly so dragging the slider does not send a request for every position.
    const timer = setTimeout(() => {
      void fetchRoute({ from, to, scenic: effectiveScenic, stepFree }, controller.signal).then((result) => {
        if (!controller.signal.aborted) setRoute({ key, result });
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // key covers from, to, scenic and stepFree, so it is the only dependency needed.
  }, [key]);

  const current = route?.key === key ? route.result : undefined;
  const loading = route?.key !== key;
  const planned = stops[selected]!.walkMinutes;
  const fromName = selected === 0 ? "Start" : stops[selected - 1]!.name;

  let status: string;
  if (loading) status = "Loading the route…";
  else if (!current) status = "Route not available right now. The dashed line shows the direction.";
  else {
    const minutes = Math.round(current.durationSeconds / 60);
    const extra = minutes - planned;
    status = `${minutes} min · ${(current.distanceMetres / 1000).toFixed(1)} km`;
    if (effectiveScenic > 0 && extra > 0) status += ` · about ${extra} min longer than planned`;
  }

  return (
    <section aria-labelledby="route-heading" className="space-y-3">
      <h3 id="route-heading" className="sr-only">
        Map and route
      </h3>
      <DayMap
        start={start}
        stops={stops}
        selected={selected}
        onSelect={onSelect}
        path={current?.path}
      />
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={navButton} disabled={selected === 0} onClick={() => onSelect(selected - 1)} aria-label="Previous leg">
          ←
        </button>
        <p className="text-center text-sm font-medium">
          Leg {selected + 1}: {fromName} → {stops[selected]!.name}
        </p>
        <button type="button" className={navButton} disabled={selected === stops.length - 1} onClick={() => onSelect(selected + 1)} aria-label="Next leg">
          →
        </button>
      </div>
      <p aria-live="polite" className="text-sm text-stone-700">
        {status}
      </p>
      <label className="block space-y-1">
        <span className="flex justify-between text-sm font-medium">
          <span>Fastest</span>
          <span>Route style</span>
          <span>Scenic</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.25}
          value={effectiveScenic}
          disabled={stepFree}
          aria-valuetext={SCENIC_LABELS[effectiveScenic * 4]}
          onChange={(e) => setScenic(Number(e.target.value))}
          className="h-11 w-full accent-brand disabled:opacity-40"
        />
      </label>
      {stepFree && <p className="text-sm text-stone-600">Step-free routes always take the plain route; scenic options are for walking only.</p>}
    </section>
  );
}
