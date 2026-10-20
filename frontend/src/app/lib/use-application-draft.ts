"use client";

import { useState } from "react";
import type {
  Application,
  ApplicationStatus,
} from "../component/ApplicationsProvider";

type Values = {
  status: ApplicationStatus;
  notes: string;
};

type Draft = Values & {
  base: Application;
};

export function useApplicationDraft(application: Application) {
  const [draft, setDraft] = useState<Draft | null>(null);

  const dirty =
    draft !== null &&
    (draft.status !== draft.base.status || draft.notes !== draft.base.notes);

  const values = draft && dirty ? draft : application;

  const changed =
    values.status !== application.status || values.notes !== application.notes;

  const versionChanged =
    draft !== null &&
    (draft.base.id !== application.id ||
      draft.base.updatedAt !== application.updatedAt);

  const hasConflict = dirty && versionChanged && changed;

  // The server has acknowledged these draft values.
  // Clear the old baseline so later refreshes cannot resurrect the draft.
  if (draft !== null && dirty && versionChanged && !changed) {
    setDraft(null);
  }

  const base = draft && dirty ? draft.base : application;

  function edit(changes: Partial<Values>) {
    setDraft({
      base: hasConflict && draft ? draft.base : application,
      status: values.status,
      notes: values.notes,
      ...changes,
    });
  }

  function discardDraft() {
    setDraft(null);
  }

  function keepDraft() {
    setDraft({
      base: application,
      status: values.status,
      notes: values.notes,
    });
  }

  return {
    status: values.status,
    notes: values.notes,
    changed,
    hasConflict,
    expected: {
      id: base.id,
      updatedAt: base.updatedAt,
    },
    edit,
    discardDraft,
    keepDraft,
  };
}
