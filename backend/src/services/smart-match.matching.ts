import type { DatabaseJob } from "../db/schema.js";
import type { MatchProfile } from "./smart-match.logic.js";
import { normalizeJobDescription } from "./job-description.logic.js";

export const MAX_SMART_MATCH_RESULTS = 20;
export const RECENT_MATCH_DAYS = 7;
export const FALLBACK_MATCH_DAYS = 30;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type JobWorkMode = "remote" | "hybrid" | "on-site" | "unknown";

export type JobSeniority = "junior" | "mid" | "senior" | "unknown";

type SkillDefinition = {
  label: string;
  aliases: string[];
};

type SkillEvidence = "required" | "preferred" | "mentioned" | "ignore";

export type ListingSignals = {
  requiredSkills: string[];
  preferredSkills: string[];
  mentionedSkills: string[];
  metadataSkills: string[];
  seniority: JobSeniority;
  workMode: JobWorkMode;
  restrictedCountries: string[];
};

const skillGroups = [
  ["JavaScript", "JS", "ECMAScript"],
  ["TypeScript", "TS"],
  ["React", "ReactJS", "React.js"],
  ["Next.js", "NextJS", "Next JS"],
  ["Node.js", "NodeJS", "Node JS"],
  ["Express", "ExpressJS", "Express.js"],
  ["Tailwind CSS", "TailwindCSS", "Tailwind"],
  ["HTML", "HTML5"],
  ["CSS", "CSS3"],
  ["PostgreSQL", "Postgres"],
  ["MongoDB", "Mongo DB"],
  ["Vue", "VueJS", "Vue.js"],
  ["Angular"],
  ["Svelte", "SvelteJS"],
  ["AWS", "Amazon Web Services"],
  ["Azure", "Microsoft Azure"],
  ["Google Cloud", "GCP", "Google Cloud Platform"],
  ["Git"],
  ["Docker"],
  ["Kubernetes", "K8s"],
  ["Python"],
  ["Django"],
  ["Flask"],
  ["FastAPI"],
  ["Java"],
  ["Spring", "Spring Boot"],
  ["C#"],
  ["C++"],
  ["C"],
  [".NET", "DotNET", "ASP.NET"],
  ["Go", "Golang"],
  ["Rust"],
  ["PHP"],
  ["Laravel"],
  ["Ruby"],
  ["Ruby on Rails", "Rails"],
  ["Swift"],
  ["Kotlin"],
  ["Redis"],
  ["GraphQL"],
  ["SQL"],
] as const;

const foundationalSkills = new Set([
  "html",
  "css",
  "git",
  "communication",
  "teamwork",
]);

const countryGroups = [
  {
    name: "United States",
    aliases: ["United States", "United States of America", "USA", "US", "U.S."],
  },
  {
    name: "United Kingdom",
    aliases: ["United Kingdom", "UK", "U.K.", "Great Britain", "GB"],
  },
  {
    name: "Canada",
    aliases: ["Canada"],
  },
  {
    name: "Australia",
    aliases: ["Australia", "AU"],
  },
  {
    name: "Germany",
    aliases: ["Germany", "DE"],
  },
  {
    name: "France",
    aliases: ["France", "FR"],
  },
  {
    name: "Netherlands",
    aliases: ["Netherlands", "NL"],
  },
  {
    name: "Singapore",
    aliases: ["Singapore", "SG"],
  },
  {
    name: "India",
    aliases: ["India"],
  },
  {
    name: "Myanmar",
    aliases: ["Myanmar", "Burma", "MM"],
  },
  {
    name: "Japan",
    aliases: ["Japan", "JP"],
  },
] as const;

function skillKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(
  text: string,
  phrase: string,
  caseSensitive = false,
): boolean {
  const trimmed = phrase.trim();

  if (!trimmed) {
    return false;
  }

  let searchable = text;

  // "Node JS" or "Next JS" alone must not imply JavaScript.
  if (trimmed.toLowerCase() === "js") {
    searchable = searchable.replace(
      /\b(?:node|next|react|vue)\s+js\b/gi,
      "frameworkjs",
    );
  }

  // Keep dots within technology names significant:
  // "JS" must not match the suffix of "Node.js".
  const before = "(^|[^a-z0-9.+#])";

  // Allow a sentence-ending dot, but not a dot that
  // continues a technology name.
  //
  // Matches: "TypeScript.", "React. Next sentence"
  // Rejects: "Java" inside "JavaScript"
  // Rejects: "C" inside "C++" or "C#"
  const after = "(?=$|[^a-z0-9.+#]|\\.(?=$|[^a-z0-9.+#]))";

  return new RegExp(
    `${before}${escapeRegex(trimmed)}${after}`,
    caseSensitive ? "" : "i",
  ).test(searchable);
}

function getSkillDefinition(value: string): SkillDefinition {
  const key = skillKey(value);

  const group = skillGroups.find((entries) =>
    entries.some((entry) => skillKey(entry) === key),
  );

  return group
    ? {
        label: group[0],
        aliases: [...group],
      }
    : {
        label: value.trim(),
        aliases: [value.trim()],
      };
}

function uniqueDefinitions(values: string[]): SkillDefinition[] {
  const definitions = new Map<string, SkillDefinition>();

  for (const value of values) {
    const definition = getSkillDefinition(value);

    if (definition.label) {
      definitions.set(skillKey(definition.label), definition);
    }
  }

  return [...definitions.values()];
}

function hasSkill(text: string, definition: SkillDefinition): boolean {
  return definition.aliases.some((alias) => containsPhrase(text, alias));
}

function isFoundational(label: string): boolean {
  return foundationalSkills.has(skillKey(label));
}

function descriptionText(job: DatabaseJob): string {
  return normalizeJobDescription(job.description) ?? "";
}

function sortedValues(values: Set<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function headingEvidence(text: string): SkillEvidence | null {
  if (
    /^(?:requirements|required(?: skills| qualifications)?|must[- ]haves?|minimum qualifications|essential skills|what you need)(?:\s*:|$)/i.test(
      text,
    )
  ) {
    return "required";
  }

  if (
    /^(?:preferred(?: skills| qualifications)?|nice[- ]to[- ]haves?|bonus(?: skills| points)?|desirable(?: skills| qualifications)?|optional skills)(?:\s*:|$)/i.test(
      text,
    )
  ) {
    return "preferred";
  }

  if (
    /^(?:benefits|perks|about us|about the company|our company)(?:\s*:|$)/i.test(
      text,
    )
  ) {
    return "ignore";
  }

  if (
    /^(?:responsibilities|what you(?: will|'ll) do|about the role|the role|our tech stack|technology stack)(?:\s*:|$)/i.test(
      text,
    )
  ) {
    return "mentioned";
  }

  return null;
}

function sentenceEvidence(text: string, section: SkillEvidence): SkillEvidence {
  if (section === "ignore") {
    return "ignore";
  }

  const preferred =
    /\b(?:preferred|optional|nice[- ]to[- ]have|bonus|desirable|not(?: strictly)? required)\b/i.test(
      text,
    );

  const required =
    /\b(?:must|required|mandatory|essential)\b/i.test(text) &&
    !/\bnot(?: strictly)? required\b/i.test(text);

  if (preferred && required) {
    return "mentioned";
  }

  if (preferred) {
    return "preferred";
  }

  if (required) {
    return "required";
  }

  return section;
}

function inferSeniority(job: DatabaseJob, description: string): JobSeniority {
  const title = job.title;

  if (/\b(?:senior|sr\.?|staff|principal|lead)\b/i.test(title)) {
    return "senior";
  }

  if (/\b(?:junior|jr\.?|entry[- ]level|intern|graduate)\b/i.test(title)) {
    return "junior";
  }

  if (/\b(?:mid[- ]level|intermediate)\b/i.test(title)) {
    return "mid";
  }

  const explicitLevel = description.match(
    /\b(?:this|the)\s+(?:role|position|job)\s+is\s+(?:a\s+)?(junior|entry[- ]level|mid[- ]level|intermediate|senior)[- ]level\b/i,
  );

  const level = explicitLevel?.[1]?.toLowerCase();

  if (
    level === "junior" ||
    level === "entry-level" ||
    level === "entry level"
  ) {
    return "junior";
  }

  if (
    level === "mid-level" ||
    level === "mid level" ||
    level === "intermediate"
  ) {
    return "mid";
  }

  if (level === "senior") {
    return "senior";
  }

  return "unknown";
}

function metadataWorkMode(text: string): JobWorkMode {
  if (/\bhybrid\b/i.test(text)) {
    return "hybrid";
  }

  const onsite = /\b(?:on[- ]?site|on[- ]?premises|office[- ]based)\b/i.test(
    text,
  );

  const remote =
    /\b(?:remote|work from home|fully distributed)\b/i.test(text) &&
    !/\b(?:not|no)\s+remote\b/i.test(text);

  if (onsite && remote) {
    return "unknown";
  }

  if (onsite) {
    return "on-site";
  }

  if (remote) {
    return "remote";
  }

  return "unknown";
}

function inferWorkMode(job: DatabaseJob, description: string): JobWorkMode {
  const metadata = [job.location ?? "", job.title, ...job.tags].join(" ");

  const fromMetadata = metadataWorkMode(metadata);

  const explicitModes = new Set<JobWorkMode>();

  for (const line of description.split(/\n+/)) {
    const explicit = line.match(
      /\b(?:this|the)\s+(?:role|position|job)\s+(?:is|will be)\s+(?:a\s+)?(?:fully\s+|100%\s+)?(remote|hybrid|on[- ]?site)\b/i,
    );

    const labelled = line.match(
      /^\s*(?:work(?:ing)? (?:mode|arrangement)|location)\s*:\s*(?:fully\s+|100%\s+)?(remote|hybrid|on[- ]?site)\b/i,
    );

    const mode = explicit?.[1] ?? labelled?.[1];

    if (mode) {
      explicitModes.add(metadataWorkMode(mode));
    }
  }

  const modes = [...explicitModes].filter((mode) => mode !== "unknown");

  if (modes.length > 1) {
    return "unknown";
  }

  const fromDescription = modes[0];

  if (
    fromMetadata !== "unknown" &&
    fromDescription &&
    fromMetadata !== fromDescription
  ) {
    return "unknown";
  }

  return fromDescription ?? fromMetadata;
}

export function getJobWorkMode(job: DatabaseJob): JobWorkMode {
  return inferWorkMode(job, descriptionText(job));
}

function findCountries(text: string): string[] {
  return countryGroups
    .filter((country) =>
      country.aliases.some((alias) => {
        if (alias.length <= 3) {
          return (
            text.trim().toUpperCase() === alias.toUpperCase() ||
            containsPhrase(text, alias, true)
          );
        }

        return containsPhrase(text, alias);
      }),
    )
    .map((country) => country.name);
}

function restrictedCountries(job: DatabaseJob, description: string): string[] {
  const countries = new Set<string>();
  const location = job.location ?? "";

  if (/\b(?:only|restricted to|residents of)\b/i.test(location)) {
    for (const country of findCountries(location)) {
      countries.add(country);
    }
  }

  for (const line of description.split(/\n+|(?<=[.!?])\s+/)) {
    const restriction = line.match(
      /\b(?:must be (?:based|located)|must (?:reside|live)|only candidates (?:based|located)|candidates must be (?:based|located))\s+in\s+(.+)/i,
    );

    if (!restriction?.[1]) {
      continue;
    }

    for (const country of findCountries(restriction[1])) {
      countries.add(country);
    }
  }

  return sortedValues(countries);
}

export function analyzeListing(
  job: DatabaseJob,
  additionalSkills: string[] = [],
): ListingSignals {
  const description = descriptionText(job);

  const definitions = uniqueDefinitions([
    ...skillGroups.map((group) => group[0]),
    ...additionalSkills,
  ]);

  const required = new Set<string>();
  const preferred = new Set<string>();
  const mentioned = new Set<string>();
  const metadata = new Set<string>();

  const metadataText = [job.title, ...job.tags].join(" ");

  for (const definition of definitions) {
    if (hasSkill(metadataText, definition)) {
      metadata.add(definition.label);
    }
  }

  let section: SkillEvidence = "mentioned";

  const segments = description.split(/\n+|;\s*|(?<=[.!?])\s+(?=[A-Z])/);

  for (const segment of segments) {
    const text = segment.replace(/^\s*[-*•]\s*/, "").trim();

    if (!text) {
      continue;
    }

    const heading = headingEvidence(text);

    if (heading) {
      section = heading;
    } else if (text.endsWith(":") && text.length < 80) {
      section = "mentioned";
    }

    if (
      /\b(?:do not use|don't use|does not use|no longer use|not using)\b/i.test(
        text,
      )
    ) {
      continue;
    }

    const evidence = sentenceEvidence(text, section);

    if (evidence === "ignore") {
      continue;
    }

    for (const definition of definitions) {
      if (!hasSkill(text, definition)) {
        continue;
      }

      if (evidence === "required") {
        required.add(definition.label);
      } else if (evidence === "preferred") {
        preferred.add(definition.label);
      } else {
        mentioned.add(definition.label);
      }
    }
  }

  for (const label of required) {
    preferred.delete(label);
    mentioned.delete(label);
  }

  for (const label of preferred) {
    mentioned.delete(label);
  }

  return {
    requiredSkills: sortedValues(required),

    preferredSkills: sortedValues(preferred),

    mentionedSkills: sortedValues(mentioned),

    metadataSkills: sortedValues(metadata),

    seniority: inferSeniority(job, description),

    workMode: inferWorkMode(job, description),

    restrictedCountries: restrictedCountries(job, description),
  };
}

function normalizeRole(value: string): string {
  return value
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\bfront\s+end\b/g, "frontend")
    .replace(/\bback\s+end\b/g, "backend")
    .replace(/\bfull\s+stack\b/g, "fullstack")
    .replace(/\s+/g, " ")
    .trim();
}

function roleFamily(value: string): string | null {
  const role = normalizeRole(value);

  for (const family of [
    "frontend",
    "backend",
    "fullstack",
    "mobile",
    "devops",
    "data",
  ]) {
    if (containsPhrase(role, family)) {
      return family;
    }
  }

  if (/\b(?:ios|android)\b/.test(role)) {
    return "mobile";
  }

  return null;
}

function matchesRole(title: string, role: string): boolean {
  const titleFamily = roleFamily(title);

  const preferredFamily = roleFamily(role);

  if (preferredFamily) {
    return titleFamily === preferredFamily;
  }

  const normalizedRole = normalizeRole(role);

  const normalizedTitle = normalizeRole(title);

  if (
    /^(?:software|web)?\s*(?:engineer|developer|programmer)$/.test(
      normalizedRole,
    )
  ) {
    return /\b(?:engineer|developer|programmer)\b/.test(normalizedTitle);
  }

  return containsPhrase(normalizedTitle, normalizedRole);
}

function conflictingRole(title: string, roles: string[]): boolean {
  if (roles.length === 0) {
    return false;
  }

  const titleFamily = roleFamily(title);

  const preferredFamilies = roles.map(roleFamily);

  if (!titleFamily || preferredFamilies.some((family) => family === null)) {
    return false;
  }

  return preferredFamilies.every((family) => {
    if (family === titleFamily) {
      return false;
    }

    if (
      [family, titleFamily].includes("fullstack") &&
      [family, titleFamily].every(
        (value) =>
          value === "frontend" || value === "backend" || value === "fullstack",
      )
    ) {
      return false;
    }

    return true;
  });
}

function seniorityConflict(
  experience: MatchProfile["experience"],
  seniority: JobSeniority,
): boolean {
  if (experience === "not-specified" || seniority === "unknown") {
    return false;
  }

  const levels = {
    junior: 0,
    mid: 1,
    senior: 2,
  };

  return levels[seniority] > levels[experience];
}

function preferredLocationConflict(
  profile: MatchProfile,
  signals: ListingSignals,
): boolean {
  if (!profile.location || signals.restrictedCountries.length === 0) {
    return false;
  }

  const preferredCountries = findCountries(profile.location);

  // This compares preferences, not verified residency.
  if (preferredCountries.length !== 1) {
    return false;
  }

  return !signals.restrictedCountries.includes(preferredCountries[0]!);
}

export function rankMatchingJobs(
  profile: MatchProfile,
  records: DatabaseJob[],
  now = new Date(),
) {
  const nowMs = now.getTime();

  if (!Number.isFinite(nowMs)) {
    throw new RangeError("Invalid matching date");
  }

  const recentCutoff = nowMs - RECENT_MATCH_DAYS * DAY_IN_MS;

  const fallbackCutoff = nowMs - FALLBACK_MATCH_DAYS * DAY_IN_MS;

  const profileSkills = uniqueDefinitions(profile.skills).map(
    (definition) => definition.label,
  );

  const profileSkillSet = new Set(profileSkills);

  const candidates = records
    .filter((job) => {
      const postedAt = Date.parse(job.postedAt);

      return (
        job.isActive &&
        Number.isFinite(postedAt) &&
        postedAt >= fallbackCutoff &&
        postedAt <= nowMs
      );
    })
    .map((job) => {
      const signals = analyzeListing(job, profile.skills);

      const allEvidence = new Set([
        ...signals.requiredSkills,
        ...signals.preferredSkills,
        ...signals.mentionedSkills,
        ...signals.metadataSkills,
      ]);

      const matchedSkills = profileSkills.filter((label) =>
        allEvidence.has(label),
      );

      const matchedRequiredSkills = signals.requiredSkills.filter((label) =>
        profileSkillSet.has(label),
      );

      const matchedPreferredSkills = signals.preferredSkills.filter((label) =>
        profileSkillSet.has(label),
      );

      const matchedMetadataSkills = signals.metadataSkills.filter((label) =>
        profileSkillSet.has(label),
      );

      const unconfirmedRequiredSkills = signals.requiredSkills.filter(
        (label) => !profileSkillSet.has(label),
      );

      const roleMatch = profile.roles.some((role) =>
        matchesRole(job.title, role),
      );

      const requiredCoreSkills = signals.requiredSkills.filter(
        (label) => !isFoundational(label),
      );

      const matchedRequiredCore = requiredCoreSkills.filter((label) =>
        profileSkillSet.has(label),
      );

      const clearEvidenceCount = new Set([
        ...matchedRequiredSkills,
        ...matchedPreferredSkills,
        ...matchedMetadataSkills,
      ]).size;

      const mentionedCoreCount = matchedSkills.filter(
        (label) =>
          signals.mentionedSkills.includes(label) && !isFoundational(label),
      ).length;

      const qualifies =
        matchedSkills.length > 0 &&
        !conflictingRole(job.title, profile.roles) &&
        !seniorityConflict(profile.experience, signals.seniority) &&
        !preferredLocationConflict(profile, signals) &&
        !(
          profile.workMode !== "any" &&
          signals.workMode !== "unknown" &&
          signals.workMode !== profile.workMode
        ) &&
        (requiredCoreSkills.length === 0 || matchedRequiredCore.length > 0) &&
        (clearEvidenceCount > 0 || mentionedCoreCount >= 2);

      const overlapThreshold = Math.min(3, profileSkills.length);

      const strength: "strong" | "partial" | "related" =
        unconfirmedRequiredSkills.length === 0 &&
        matchedSkills.length >= overlapThreshold &&
        clearEvidenceCount > 0
          ? "strong"
          : "partial";

      const score =
        matchedRequiredSkills.length * 12 +
        matchedPreferredSkills.length * 6 +
        matchedMetadataSkills.length * 5 +
        mentionedCoreCount * 2 +
        (roleMatch ? 8 : 0) +
        (profile.workMode !== "any" && signals.workMode === profile.workMode
          ? 4
          : 0) -
        unconfirmedRequiredSkills.length * 2;

      return {
        job,
        matchedSkills,
        matchedRequiredSkills,
        matchedPreferredSkills,
        unconfirmedRequiredSkills,
        roleMatch,
        workMode: signals.workMode,
        seniority: signals.seniority,
        strength,
        score,
        qualifies,
      };
    })
    .filter((match) => match.qualifies);

  const recentMatches = candidates.filter(
    (match) => Date.parse(match.job.postedAt) >= recentCutoff,
  );

  const selected = recentMatches.length > 0 ? recentMatches : candidates;

  return selected
    .sort(
      (a, b) =>
        Date.parse(b.job.postedAt) - Date.parse(a.job.postedAt) ||
        b.score - a.score ||
        a.job.id.localeCompare(b.job.id),
    )
    .slice(0, MAX_SMART_MATCH_RESULTS);
}
