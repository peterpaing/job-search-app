import { describe, expect, it } from "vitest";
import { classifyJobPage } from "../../services/job-availability.logic.js";
import { isPublicAddress } from "../../services/safe-job-page.service.js";

const job = {
  title: "Frontend Engineer",
  company: "Example",
};

const NOW = new Date("2026-10-13T12:00:00Z");

function page(validThrough: string, overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    html: `
      <script type="application/ld+json">
        ${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: job.title,
          hiringOrganization: {
            "@type": "Organization",
            name: job.company,
          },
          validThrough,
          ...overrides,
        })}
      </script>
    `,
  };
}

describe("classifyJobPage", () => {
  it("recognizes a matching expired listing", () => {
    expect(
      classifyJobPage(job, page("2026-10-12T12:00:00Z"), NOW),
    ).toMatchObject({
      result: "closed",
      reason: "listing_expired",
    });
  });

  it("recognizes a matching future listing", () => {
    expect(
      classifyJobPage(job, page("2026-10-20T12:00:00Z"), NOW),
    ).toMatchObject({
      result: "active",
      reason: "verified_listing",
    });
  });

  it.each([404, 410])("requires confirmation for HTTP %i", (status) => {
    expect(classifyJobPage(job, { status, html: "" }, NOW)).toMatchObject({
      result: "missing",
      reason: "listing_removed",
    });
  });

  it.each([401, 403, 429, 500, 502, 503])(
    "does not close jobs for HTTP %i",
    (status) => {
      expect(classifyJobPage(job, { status, html: "" }, NOW).result).toBe(
        "unknown",
      );
    },
  );

  it("does not trust another job's expiry", () => {
    expect(
      classifyJobPage(
        job,
        page("2026-10-12T12:00:00Z", {
          title: "Backend Engineer",
        }),
        NOW,
      ).result,
    ).toBe("unknown");
  });

  it("requires a matching company", () => {
    expect(
      classifyJobPage(
        job,
        page("2026-10-12T12:00:00Z", {
          hiringOrganization: { name: "Other Company" },
        }),
        NOW,
      ).result,
    ).toBe("unknown");
  });

  it("does not infer closure from ordinary page text", () => {
    expect(
      classifyJobPage(
        job,
        {
          status: 200,
          html: "<p>Related jobs are closed.</p>",
        },
        NOW,
      ).result,
    ).toBe("unknown");
  });

  it("ignores malformed JSON", () => {
    expect(
      classifyJobPage(
        job,
        {
          status: 200,
          html: '<script type="application/ld+json">{invalid}</script>',
        },
        NOW,
      ).result,
    ).toBe("unknown");
  });

  it("rejects ambiguous pages with multiple postings", () => {
    const listing = page("2026-10-12T12:00:00Z");

    expect(
      classifyJobPage(
        job,
        {
          ...listing,
          html: listing.html + listing.html,
        },
        NOW,
      ).result,
    ).toBe("unknown");
  });

  it("does not prematurely expire date-only deadlines", () => {
    expect(
      classifyJobPage(job, page("2026-10-13"), new Date("2026-10-14T11:00:00Z"))
        .result,
    ).toBe("active");

    expect(
      classifyJobPage(job, page("2026-10-13"), new Date("2026-10-14T13:00:00Z"))
        .result,
    ).toBe("closed");
  });

  it.each(["invalid", "2026-02-31", "2026-10-20T12:00:00"])(
    "does not trust invalid or timezone-free expiry %j",
    (expiry) => {
      expect(classifyJobPage(job, page(expiry), NOW).result).toBe("unknown");
    },
  );
});

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "not-an-address",
  ])("blocks restricted address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});
