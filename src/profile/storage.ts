import { profileSchema, type Profile } from "./profile";

// The profile lives only on this phone. Nothing here sends it anywhere.
export const PROFILE_KEY = "tourwiz.profile";

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Storage can throw (Safari private mode, blocked site data), so every call is guarded.
export function loadProfile(store: KeyValueStore = localStorage): Profile | null {
  try {
    const raw = store.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = profileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile, store: KeyValueStore = localStorage): boolean {
  try {
    store.setItem(PROFILE_KEY, JSON.stringify(profileSchema.parse(profile)));
    return true;
  } catch {
    return false;
  }
}

export function deleteProfile(store: KeyValueStore = localStorage): void {
  try {
    store.removeItem(PROFILE_KEY);
  } catch {
    // Nothing stored or storage blocked: either way there is nothing left to delete.
  }
}
