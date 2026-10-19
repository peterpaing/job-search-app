import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "../../app/privacy/page";
import TermsPage from "../../app/terms/page";
import { policiesAreDraft, siteDetails } from "../../app/lib/site-details";

describe("Legal pages", () => {
  it("renders the privacy notice with operator and contact details", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Privacy Policy",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Pyae Sone Paing, trading as StackWing"),
    ).toBeInTheDocument();

    expect(screen.getByText("Thailand")).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: siteDetails.supportEmail,
      }),
    ).toHaveAttribute("href", "mailto:stackwingjobs.support@gmail.com");

    expect(
      screen.getByRole("navigation", {
        name: "Policy navigation",
      }),
    ).toBeInTheDocument();
  });

  it("shows a warning while the business address is incomplete", () => {
    render(<PrivacyPage />);

    const warning = screen.queryByLabelText("Draft policy notice");

    if (policiesAreDraft) {
      expect(warning).toBeInTheDocument();
    } else {
      expect(warning).not.toBeInTheDocument();
    }
  });

  it("explains monthly renewals and the refund window", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Terms of Service",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(/US\$1\.99 per month/)).toBeInTheDocument();

    expect(
      screen.getByText(/including every monthly renewal/),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/72 hours from the successful charge timestamp/),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Eligible refunds are processed manually/),
    ).toBeInTheDocument();
  });
});
