import { useState } from "react";
import prague from "../data/cities/prague.json";
import { parseCity } from "./catalogue";
import {
  createProfile,
  deleteProfile,
  loadProfile,
  rate,
  saveProfile,
  type OnboardingAnswers,
  type Profile,
  type Stars,
} from "./profile";
import { AppShell } from "./ui/AppShell";
import { Onboarding } from "./ui/Onboarding";
import { PlanView } from "./ui/PlanView";

const city = parseCity(prague);

function todayIn(timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

// Editing keeps ratings and small learned weights, and resets the picked interests to full weight.
function updateProfile(old: Profile, answers: OnboardingAnswers): Profile {
  const fresh = createProfile(answers);
  const learned = Object.fromEntries(Object.entries(old.interests).filter(([, w]) => (w ?? 0) < 0.5));
  return { ...fresh, interests: { ...learned, ...fresh.interests }, ratings: old.ratings };
}

export function App() {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [editing, setEditing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [planVersion, setPlanVersion] = useState(0);

  const store = (next: Profile) => {
    setProfile(next);
    setSaveFailed(!saveProfile(next));
  };

  return (
    <AppShell>
      {saveFailed && (
        <p role="status" className="mb-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
          This browser won't let us save, for example in private browsing. Your plan works, but it's gone when you close
          the page.
        </p>
      )}
      {!profile || editing ? (
        <Onboarding
          initial={profile ?? undefined}
          onDone={(answers) => {
            store(profile ? updateProfile(profile, answers) : createProfile(answers));
            setEditing(false);
            setPlanVersion((v) => v + 1);
          }}
          onCancel={profile ? () => setEditing(false) : undefined}
        />
      ) : (
        <PlanView
          // A new key after editing resets the plan to the new interests; ratings alone keep it.
          key={planVersion}
          city={city}
          profile={profile}
          today={todayIn(city.timezone)}
          onRate={(placeId, stars: Stars) => {
            const place = city.places.find((p) => p.id === placeId)!;
            store(rate(profile, city.id, place, stars));
          }}
          onEdit={() => setEditing(true)}
          onDelete={() => {
            deleteProfile();
            setProfile(null);
            setSaveFailed(false);
          }}
        />
      )}
    </AppShell>
  );
}
