import type { PendingVisit } from "./applications.types";

const LEGACY_STORAGE_KEY = "dev-jobs:pending-application-visits:v1";
const GUEST_STORAGE_KEY = "dev-jobs:pending-application-visits:v2:guest";

export function storageKeyFor(userId: string | null) {
  return userId
    ? `dev-jobs:pending-application-visits:v2:user:${encodeURIComponent(userId)}`
    : GUEST_STORAGE_KEY;
}

function readVisits(storageKey: string): PendingVisit[] {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "[]",
    );

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is PendingVisit => {
        if (!entry || typeof entry !== "object") {
          return false;
        }

        const candidate = entry as Partial<PendingVisit>;
        const job = candidate.job;

        return (
          typeof candidate.confirmed === "boolean" &&
          !!job &&
          typeof job.id === "string" &&
          typeof job.title === "string" &&
          typeof job.company === "string" &&
          (job.url === undefined || typeof job.url === "string")
        );
      })
      .slice(-10);
  } catch {
    return [];
  }
}

export function persistVisits(
  storageKey: string,
  visits: PendingVisit[],
): boolean {
  try {
    if (visits.length === 0) {
      sessionStorage.removeItem(storageKey);
    } else {
      sessionStorage.setItem(storageKey, JSON.stringify(visits));
    }

    return true;
  } catch {
    // In-memory prompts still work without browser storage.
    return false;
  }
}

export function restoreVisits(userId: string | null): PendingVisit[] {
  // Legacy entries have no account owner. Never replay them.
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // The legacy key is never read even if removal fails.
  }

  const storageKey = storageKeyFor(userId);
  const ownedVisits = readVisits(storageKey);

  if (!userId) {
    return ownedVisits;
  }

  // Only an explicit guest Yes can continue after sign-in.
  const guestChoices = readVisits(GUEST_STORAGE_KEY).filter(
    (visit) => visit.confirmed,
  );

  // Consume choices before network work so another account cannot claim them.
  try {
    sessionStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    return ownedVisits;
  }

  const merged = [
    ...ownedVisits,
    ...guestChoices.filter(
      (guest) => !ownedVisits.some((owned) => owned.job.id === guest.job.id),
    ),
  ].slice(-10);

  persistVisits(storageKey, merged);

  return merged;
}
