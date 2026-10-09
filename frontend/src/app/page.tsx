import { Suspense } from "react";
import { redirect } from "next/navigation";
import Intro from "./component/Intro";
import type { Job } from "./component/JobCard";
import JobsError from "./component/JobsError";
import JobsLayout from "./component/JobsLayout";
import JobsList from "./component/JobsList";
import JobsLoading from "./component/JobsLoading";
import JobsResultsCount from "./component/JobsResultsCount";

type JobsResponse = {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pageUrl(query: URLSearchParams) {
  const queryString = query.toString();

  return queryString ? `/?${queryString}` : "/";
}

function readPage(value: string | string[] | undefined) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    Number(value) > 1_000_000
  ) {
    return 1;
  }

  return Number(value);
}

async function JobResults({ queryString }: { queryString: string }) {
  let data: JobsResponse;

  try {
    const apiUrl = new URL(
      process.env.JOBS_API_URL ?? "http://localhost:5000/api/jobs",
    );

    apiUrl.search = queryString;

    const response = await fetch(apiUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.status}`);
    }

    data = await response.json();

    if (
      !Array.isArray(data.jobs) ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      !Number.isSafeInteger(data.page) ||
      data.page < 1 ||
      data.pageSize !== 18 ||
      !Number.isSafeInteger(data.totalPages) ||
      data.totalPages !== Math.ceil(data.total / data.pageSize) ||
      data.page > Math.max(data.totalPages, 1) ||
      data.jobs.length > data.pageSize ||
      data.jobs.length > data.total
    ) {
      throw new Error("The jobs response is invalid.");
    }
  } catch (error) {
    console.error("Failed to load job results:", error);

    return <JobsError />;
  }

  const query = new URLSearchParams(queryString);
  const requestedPage = Number(query.get("page") ?? "1");

  // Redirect must stay outside the catch block.
  if (data.page !== requestedPage) {
    if (data.page === 1) {
      query.delete("page");
    } else {
      query.set("page", String(data.page));
    }

    redirect(pageUrl(query));
  }

  return (
    <>
      <JobsResultsCount total={data.total} />

      <JobsList
        key={queryString}
        jobs={data.jobs}
        page={data.page}
        totalPages={data.totalPages}
      />
    </>
  );
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  const selectedSources = params.source;

  if (Array.isArray(selectedSources)) {
    for (const source of selectedSources) {
      query.append("source", source);
    }
  } else if (typeof selectedSources === "string") {
    query.append("source", selectedSources);
  }

  if (typeof params.q === "string" && params.q.trim()) {
    query.set("q", params.q.trim());
  }

  if (typeof params.location === "string" && params.location.trim()) {
    query.set("location", params.location.trim());
  }

  if (typeof params.company === "string" && params.company.trim()) {
    query.set("company", params.company.trim());
  }

  if (typeof params.postedWithin === "string" && params.postedWithin !== "") {
    query.set("postedWithin", params.postedWithin);
  }

  const page = readPage(params.page);

  if (page > 1) {
    query.set("page", String(page));
  }

  // Keep page one URLs clean and normalize malformed page values.
  const canonicalPage = page > 1 ? String(page) : undefined;

  if (params.page !== undefined && params.page !== canonicalPage) {
    redirect(pageUrl(query));
  }

  const queryString = query.toString();

  return (
    <>
      <Intro />

      <JobsLayout>
        <Suspense key={queryString} fallback={<JobsLoading />}>
          <JobResults queryString={queryString} />
        </Suspense>
      </JobsLayout>
    </>
  );
}
