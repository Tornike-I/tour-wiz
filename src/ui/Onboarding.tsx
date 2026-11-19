import { useState, type FormEvent } from "react";
import { TAGS, type Tag } from "../catalogue/tags";
import { PACES, type OnboardingAnswers, type Pace, type Profile } from "../profile";
import { PACE_LABELS, TAG_LABELS } from "./labels";

const toggleClass = (on: boolean) =>
  `min-h-11 min-w-11 rounded-full border px-4 py-2 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    on ? "border-brand bg-brand text-white" : "border-stone-300 bg-white text-stone-800"
  }`;

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
  const [showError, setShowError] = useState(false);

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
    onDone({ interests: TAGS.filter((t) => interests.has(t)), pace, stepFree });
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
        <button
          type="button"
          role="switch"
          aria-checked={stepFree}
          onClick={() => setStepFree((v) => !v)}
          className={`${toggleClass(stepFree)} w-full rounded-xl text-left`}
        >
          {stepFree ? "✓ " : ""}I need step-free routes (no stairs)
        </button>
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
