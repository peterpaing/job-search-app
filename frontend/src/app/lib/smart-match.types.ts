import type { Job } from "../component/JobCard";
import type { SmartMatchUsageData } from "../component/SmartMatchUsage";

export type Profile = {
  skills: string[];
  roles: string[];
  experience: "not-specified" | "junior" | "mid" | "senior";
  location: string;
  workMode: "any" | "remote" | "hybrid" | "on-site";
};

export type Access = {
  premium: boolean;
  aiEnabled: boolean;
  dailyLimit: number;
};

export type ProfileState = {
  profile: Profile | null;
  usage: SmartMatchUsageData;
};

export type Match = {
  job: Job;
  matchedSkills: string[];
  strength: "strong" | "partial" | "related";
  workMode: "remote" | "hybrid" | "on-site" | "unknown";
};

export type MatchesResponse = {
  matches: Match[];
  searched: number;
};

export type BootstrapResponse = {
  access: Access;
  profile: Profile | null;
  usage: SmartMatchUsageData | null;
  matches: Match[];
  searched: number;
};

export type ExtractionResponse = {
  draft: Profile;
  cached: boolean;
  usage: SmartMatchUsageData;
};

export type AnswerResponse = {
  answer: string;
  cached: boolean;
  outOfScope?: boolean;
  usage: SmartMatchUsageData;
};
