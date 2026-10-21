export type ApplicationStatus =
  "applied" | "interviewing" | "offered" | "rejected";

export type Application = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  url: string;
  status: ApplicationStatus;
  notes: string;
  appliedAt: string;
  updatedAt: string;
};

export type VisitedJob = {
  id: string;
  title: string;
  company: string;
  url?: string;
};

export type PendingVisit = {
  job: VisitedJob;
  confirmed: boolean;
};

export type ApplicationUpdate = {
  status?: ApplicationStatus;
  notes?: string;
  expected?: {
    id: string;
    updatedAt: string;
  };
};
