import { createServer } from "node:http";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const createdAt = Date.now();

function postedDaysAgo(days) {
  return new Date(createdAt - days * DAY_IN_MS).toISOString();
}

function createJobs({
  count,
  source,
  prefix,
  title,
  company,
  location,
  tags,
  daysAgo,
}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    source,
    title: `${title} ${index + 1}`,
    company,
    companyLogo: null,
    description: "",
    location,
    country: location,
    tags,
    url: `https://example.com/jobs/${prefix}-${index + 1}`,
    postedAt: postedDaysAgo(
      typeof daysAgo === "function" ? daysAgo(index) : daysAgo,
    ),
  }));
}

// Fixtures are already arranged in the application's source priority.
const jobs = [
  ...createJobs({
    count: 24,
    source: "Himalayas",
    prefix: "himalayas",
    title: "React Developer",
    company: "Acme Labs",
    location: "Singapore",
    tags: ["react", "typescript"],
    daysAgo: (index) => (index < 12 ? 0.05 : 3),
  }),
  ...createJobs({
    count: 4,
    source: "Dev Global Jobs",
    prefix: "dev-global",
    title: "Full Stack Developer",
    company: "Global Company",
    location: "Germany",
    tags: ["react", "node"],
    daysAgo: 0.05,
  }),
  ...createJobs({
    count: 4,
    source: "We Work Remotely",
    prefix: "wwr",
    title: "Python Developer",
    company: "Python Company",
    location: "Canada",
    tags: ["python"],
    daysAgo: 0.05,
  }),
  ...createJobs({
    count: 12,
    source: "Remote OK",
    prefix: "remote-ok",
    title: "Backend Developer",
    company: "Backend Company",
    location: "Malaysia",
    tags: ["node", "typescript"],
    daysAgo: 10,
  }),
];

function contains(value, search) {
  return (value ?? "").toLowerCase().includes(search.toLowerCase());
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost:5010");

  if (req.method !== "GET" || url.pathname !== "/api/jobs") {
    res.writeHead(404);
    res.end();
    return;
  }

  const params = url.searchParams;
  const sources = params.getAll("source");
  const keyword = params.get("q") ?? "";
  const location = params.get("location") ?? "";
  const company = params.get("company") ?? "";
  const postedWithin = params.get("postedWithin") ?? "";
  const now = Date.now();

  const matchingJobs = jobs.filter((job) => {
    if (sources.length > 0 && !sources.includes(job.source)) {
      return false;
    }

    if (company && !contains(job.company, company)) {
      return false;
    }

    if (
      keyword &&
      !contains(job.title, keyword) &&
      !job.tags.some((tag) => contains(tag, keyword))
    ) {
      return false;
    }

    if (
      location &&
      !contains(job.location, location) &&
      !contains(job.country, location)
    ) {
      return false;
    }

    if (postedWithin) {
      const cutoff = now - Number(postedWithin) * DAY_IN_MS;
      const postedAt = Date.parse(job.postedAt);

      if (postedAt < cutoff || postedAt > now) {
        return false;
      }
    }

    return true;
  });

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

  res.end(
    JSON.stringify({
      jobs: matchingJobs,
      total: matchingJobs.length,
    }),
  );
});

server.listen(5010, () => {
  console.log("Test jobs API running on port 5010");
});
