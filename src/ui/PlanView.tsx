import { useMemo, useRef, useState } from "react";
import { isInCity, type City } from "../catalogue";
import { RoutePanel } from "../map/RoutePanel";
import { plan } from "../planner";
import { ratingKey, type Profile, type Stars } from "../profile";
import { CROWD_LABELS } from "./labels";

const crowdBadge = ["bg-emerald-100 text-emerald-900", "bg-emerald-100 text-emerald-900", "bg-amber-100 text-amber-900", "bg-orange-100 text-orange-900", "bg-red-100 text-red-900"];
const inputClass = "min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base";

type Props = {
  city: City;
  profile: Profile;
  today: string;
  onRate: (placeId: string, stars: Stars) => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function PlanView({ city, profile, today, onRate, onEdit, onDelete }: Props) {
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  // The plan keeps the profile it was made with, so rating a stop does not reshuffle the day under you.
  const [planProfile, setPlanProfile] = useState(profile);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selected, setSelected] = useState(0);
  // Held only in memory for this plan: never saved, logged or sent anywhere except one leg to the route proxy.
  const [from, setFrom] = useState<[number, number]>();
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string>();
  const mapRef = useRef<HTMLDivElement>(null);

  const locate = () => {
    const centre = "so the day starts at the city centre.";
    if (!("geolocation" in navigator)) {
      setLocationNote(`This browser can't share your location, ${centre}`);
      return;
    }
    setLocating(true);
    setLocationNote(undefined);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const point: [number, number] = [coords.latitude, coords.longitude];
        if (!isInCity(city, point)) {
          setLocationNote(`You're not in ${city.name} right now, ${centre}`);
          return;
        }
        setFrom(point);
        setSelected(0);
      },
      () => {
        setLocating(false);
        setLocationNote(`We couldn't get your location, ${centre}`);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const day = useMemo(
    () => (date && start < end ? plan(city, planProfile, { date, start, end, from }) : undefined),
    [city, planProfile, date, start, end, from],
  );
  const places = useMemo(() => new Map(city.places.map((p) => [p.id, p])), [city]);
  const mapStops = useMemo(
    () =>
      (day?.stops ?? []).map((s) => ({
        name: s.name,
        location: places.get(s.placeId)!.location,
        walkMinutes: s.walkMinutes,
        rest: s.rest?.location,
      })),
    [day, places],
  );
  const leg = Math.min(selected, Math.max(mapStops.length - 1, 0));
  const showLeg = (i: number) => {
    setSelected(i);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const ratingsChanged = profile !== planProfile;

  return (
    <div className="space-y-6">
      <section aria-labelledby="plan-heading" className="space-y-4">
        <h2 id="plan-heading" className="text-2xl font-semibold">
          Your day in {city.name}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 space-y-1 text-sm font-medium">
            <span>Date</span>
            <input type="date" className={inputClass} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>From</span>
            <input type="time" className={inputClass} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Until</span>
            <input type="time" className={inputClass} value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} />
          </label>
        </div>
        <div className="space-y-2">
          {from ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm shadow-sm">
              <span className="font-medium">Starting from your location</span>
              <button
                type="button"
                onClick={() => setFrom(undefined)}
                className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 font-medium"
              >
                Use the city centre
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-4 font-medium disabled:opacity-60"
            >
              {locating ? "Finding you…" : "Start from my location"}
            </button>
          )}
          <p role="status" className="text-sm text-stone-600">
            {locationNote ?? "Your location is used once for this plan and never saved."}
          </p>
        </div>
        {planProfile.stepFree && (
          <p className="rounded-lg bg-white p-3 text-sm text-stone-700 shadow-sm">
            Step-free plan: places with steps, or with no access information in OpenStreetMap, are left out. Rests are on
            benches.
          </p>
        )}
        {start >= end && <p role="alert" className="font-medium text-red-700">The day must end after it starts.</p>}
        {ratingsChanged && (
          <button
            type="button"
            onClick={() => setPlanProfile(profile)}
            className="min-h-11 w-full rounded-xl border border-brand bg-white px-4 font-semibold text-brand"
          >
            Re-plan with my new ratings
          </button>
        )}
      </section>

      {day && day.stops.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-stone-800 shadow-sm">
          Nothing fits this day. Try a longer day, another date or more interests.
        </p>
      )}

      {day && day.stops.length > 0 && (
        <section aria-labelledby="stops-heading" className="space-y-3">
          <h3 id="stops-heading" className="sr-only">
            Stops
          </h3>
          <p className="text-stone-700">
            {day.stops.length} stops · {day.walkedKm} km walking · {Math.round(day.quietShare * 100)}% at quiet times
          </p>
          <div ref={mapRef} className="scroll-mt-4">
            <RoutePanel start={from ?? city.center} stops={mapStops} selected={leg} onSelect={setSelected} stepFree={planProfile.stepFree} />
          </div>
          <ol className="space-y-3">
            {day.stops.map((stop, i) => {
              const place = places.get(stop.placeId)!;
              const rated = profile.ratings[ratingKey(city.id, stop.placeId)];
              const estimated = place.crowdSource.startsWith("PLACEHOLDER");
              return (
                <li key={stop.placeId} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
                  {stop.walkMinutes > 0 && (
                    <p className="text-sm text-stone-600">
                      {stop.walkMinutes} min walk
                      {stop.rest ? `, with a ${stop.rest.minutes} min rest on the way` : ""}
                      {stop.waitMinutes > 0 ? `, then ${stop.waitMinutes} min free` : ""}
                    </p>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-lg font-semibold">
                      <span className="text-stone-500">{i + 1}.</span> {stop.name}
                    </h4>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-medium ${crowdBadge[stop.crowdLevel]}`}>
                      {CROWD_LABELS[stop.crowdLevel]}
                      {estimated ? "*" : ""}
                    </span>
                  </div>
                  <p className="font-medium">
                    {stop.arrive}–{stop.leave}
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-stone-700">
                    {stop.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => showLeg(i)}
                    aria-pressed={leg === i}
                    className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium aria-pressed:border-brand aria-pressed:text-brand"
                  >
                    {leg === i ? "On the map" : "Show route here"}
                  </button>
                  {place.url && (
                    <a
                      href={place.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center font-medium text-brand underline"
                    >
                      Opening hours and tickets
                    </a>
                  )}
                  <fieldset>
                    <legend className="text-sm font-medium text-stone-700">
                      {rated ? `You rated it ${rated} of 5` : "Been here? Rate it"}
                    </legend>
                    <div className="mt-1 flex gap-1">
                      {([1, 2, 3, 4, 5] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-label={`Rate ${stop.name} ${s} of 5`}
                          aria-pressed={rated === s}
                          onClick={() => onRate(stop.placeId, s)}
                          className={`size-11 rounded-lg text-2xl leading-none ${rated && s <= rated ? "text-amber-500" : "text-stone-300"}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {day.stops.some((s) => places.get(s.placeId)!.crowdSource.startsWith("PLACEHOLDER")) && (
            <p className="text-sm text-stone-600">* Estimated crowd level, not yet measured.</p>
          )}
        </section>
      )}

      <section aria-label="Your data" className="space-y-2 border-t border-stone-200 pt-4">
        <button type="button" onClick={onEdit} className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-4 font-medium">
          Change my interests
        </button>
        {confirmDelete ? (
          <div className="flex gap-2">
            <button type="button" onClick={onDelete} className="min-h-11 flex-1 rounded-xl bg-red-700 px-4 font-semibold text-white">
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 flex-1 rounded-xl border border-stone-300 bg-white px-4 font-medium">
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 w-full rounded-xl px-4 font-medium text-red-700">
            Delete my data from this phone
          </button>
        )}
      </section>
    </div>
  );
}
