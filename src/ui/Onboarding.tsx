import { useRef, useState, type FormEvent } from "react";
import { TAGS, type Tag } from "../catalogue/tags";
import { MAX_GROUP, PACES, type OnboardingAnswers, type Pace, type Profile } from "../profile";
import { PACE_LABELS, TAG_LABELS } from "./labels";

const toggleClass = (on: boolean) =>
  `min-h-11 min-w-11 rounded-full border px-4 py-2 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    on ? "border-brand bg-brand text-white" : "border-stone-300 bg-white text-stone-800"
  }`;

const REST_OPTIONS = [
  { minutes: undefined, label: "No need" },
  { minutes: 10, label: "After 10 min walking" },
  { minutes: 20, label: "After 20 min walking" },
];
const WALK_KM_OPTIONS = [2, 4, 6, 10, 14];

type Member = { key: number; name: string; interests: Set<Tag> };
const memberName = (m: Member, i: number) => m.name.trim() || `Person ${i + 2}`;

type Props = {
  initial?: Profile;
  onDone: (answers: OnboardingAnswers) => void;
  onCancel?: () => void;
};

export function Onboarding({ initial, onDone, onCancel }: Props) {
  const [interests, setInterests] = useState<Set<Tag>>(
    new Set(initial ? (Object.keys(initial.interests) as Tag[]).filter((t) => (initial.interests[t] ?? 0) >= 0.5) : []),
  );
  const [pace, setPace] = useState<Pace>(initial?.pace ?? "normal");
  const [stepFree, setStepFree] = useState(initial?.stepFree ?? false);
  const [restEvery, setRestEvery] = useState<number | undefined>(initial?.restEveryMinutes);
  // Undefined follows the pace's default until the traveller picks a limit.
  const [walkKm, setWalkKm] = useState<number | undefined>(
    initial && initial.maxWalkKmPerDay !== PACES[initial.pace].maxWalkKmPerDay ? initial.maxWalkKmPerDay : undefined,
  );
  const shownKm = walkKm ?? PACES[pace].maxWalkKmPerDay;
  const [showError, setShowError] = useState(false);
  const nextKey = useRef(0);
  const [group, setGroup] = useState<Member[]>(() =>
    (initial?.group ?? []).map((m) => ({ key: nextKey.current++, name: m.name, interests: new Set(m.interests) })),
  );
  const [groupError, setGroupError] = useState<string>();

  const updateMember = (key: number, change: (m: Member) => Member) => {
    setGroupError(undefined);
    setGroup((prev) => prev.map((m) => (m.key === key ? change(m) : m)));
  };
  const toggleMemberTag = (key: number, tag: Tag) =>
    updateMember(key, (m) => {
      const interests = new Set(m.interests);
      if (interests.has(tag)) interests.delete(tag);
      else interests.add(tag);
      return { ...m, interests };
    });

  const toggle = (tag: Tag) => {
    setShowError(false);
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (interests.size === 0) {
      setShowError(true);
      return;
    }
    const empty = group.findIndex((m) => m.interests.size === 0);
    if (empty >= 0) {
      setGroupError(`Pick at least one interest for ${memberName(group[empty]!, empty)}, or remove them.`);
      return;
    }
    onDone({
      interests: TAGS.filter((t) => interests.has(t)),
      pace,
      stepFree,
      ...(walkKm ? { maxWalkKmPerDay: walkKm } : {}),
      ...(restEvery ? { restEveryMinutes: restEvery } : {}),
      ...(group.length
        ? { group: group.map((m, i) => ({ name: memberName(m, i), interests: TAGS.filter((t) => m.interests.has(t)) })) }
        : {}),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-8" aria-labelledby="onboarding-heading">
      <div className="space-y-1">
        <h2 id="onboarding-heading" className="text-2xl font-semibold">
          {initial ? "Change what you like" : "What do you like?"}
        </h2>
        <p className="text-stone-700">Takes 30 seconds. We plan each day around it.</p>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-lg font-semibold">Pick a few interests</legend>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={interests.has(tag)}
              onClick={() => toggle(tag)}
              className={toggleClass(interests.has(tag))}
            >
              {TAG_LABELS[tag]}
            </button>
          ))}
        </div>
        {showError && (
          <p role="alert" className="font-medium text-red-700">
            Pick at least one interest.
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-lg font-semibold">Who's coming?</legend>
        <p className="text-stone-700">Travelling with friends or family? Add them here. The plan fits everyone.</p>
        {group.map((m, i) => (
          <div key={m.key} className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
            <label className="block space-y-1 font-medium">
              <span>Name</span>
              <input
                value={m.name}
                maxLength={30}
                placeholder={`Person ${i + 2}`}
                aria-label={`Name of person ${i + 2}`}
                onChange={(e) => updateMember(m.key, (old) => ({ ...old, name: e.target.value }))}
                className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base font-normal"
              />
            </label>
            <div role="group" aria-label={`${memberName(m, i)}'s interests`} className="flex flex-wrap gap-2">
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={m.interests.has(tag)}
                  onClick={() => toggleMemberTag(m.key, tag)}
                  className={toggleClass(m.interests.has(tag))}
                >
                  {TAG_LABELS[tag]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setGroupError(undefined);
                setGroup((prev) => prev.filter((x) => x.key !== m.key));
              }}
              className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 font-medium"
            >
              Remove {memberName(m, i)}
            </button>
          </div>
        ))}
        {groupError && (
          <p role="alert" className="font-medium text-red-700">
            {groupError}
          </p>
        )}
        {group.length < MAX_GROUP && (
          <button
            type="button"
            onClick={() => setGroup((prev) => [...prev, { key: nextKey.current++, name: "", interests: new Set() }])}
            className="min-h-11 w-full rounded-xl border border-dashed border-stone-400 bg-white px-4 font-medium"
          >
            + Add a person
          </button>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-lg font-semibold">Your walking pace</legend>
        <div className="grid gap-2">
          {(Object.keys(PACES) as Pace[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={pace === p}
              onClick={() => setPace(p)}
              className={`${toggleClass(pace === p)} flex flex-col items-start rounded-xl text-left`}
            >
              <span>{PACE_LABELS[p].name}</span>
              <span className={`text-sm font-normal ${pace === p ? "text-white" : "text-stone-600"}`}>
                {PACE_LABELS[p].hint}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-lg font-semibold">Access</legend>
        {group.length > 0 && <p className="mb-3 text-stone-700">Set these for whoever in the group needs them most.</p>}
        <button
          type="button"
          role="switch"
          aria-checked={stepFree}
          onClick={() => setStepFree((v) => !v)}
          className={`${toggleClass(stepFree)} w-full rounded-xl text-left`}
        >
          {stepFree ? "✓ " : ""}I need step-free routes (no stairs)
        </button>

        <p id="rest-label" className="mt-5 mb-2 font-medium">Rest breaks</p>
        <div role="group" aria-labelledby="rest-label" className="flex flex-wrap gap-2">
          {REST_OPTIONS.map(({ minutes, label }) => (
            <button
              key={label}
              type="button"
              aria-pressed={restEvery === minutes}
              onClick={() => setRestEvery(minutes)}
              className={toggleClass(restEvery === minutes)}
            >
              {label}
            </button>
          ))}
        </div>

        <p id="walk-label" className="mt-5 mb-2 font-medium">Most walking in a day</p>
        <div role="group" aria-labelledby="walk-label" className="flex flex-wrap gap-2">
          {WALK_KM_OPTIONS.map((km) => (
            <button
              key={km}
              type="button"
              aria-pressed={shownKm === km}
              onClick={() => setWalkKm(km)}
              className={toggleClass(shownKm === km)}
            >
              {km} km
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-3">
        <button
          type="submit"
          className="min-h-12 w-full rounded-xl bg-brand px-4 text-lg font-semibold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {initial ? "Save and re-plan" : "Plan my day"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-4 font-medium"
          >
            Cancel
          </button>
        )}
        <p className="text-sm text-stone-600">Saved only on this phone. No account, nothing sent to us.</p>
      </div>
    </form>
  );
}
