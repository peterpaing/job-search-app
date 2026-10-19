import Link from "next/link";
import { policiesAreDraft, siteDetails } from "../lib/site-details";

type LegalSection = {
  title: string;
  paragraphs: readonly string[];
};

type LegalDocumentProps = {
  title: string;
  introduction: string;
  sections: readonly LegalSection[];
};

export default function LegalDocument({
  title,
  introduction,
  sections,
}: LegalDocumentProps) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
      <header className="border-border border-b pb-8">
        <p className="text-muted text-sm">
          Last updated: {siteDetails.updatedAt}
        </p>

        <h1 className="text-primary mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>

        <p className="text-muted mt-5 text-sm leading-7">{introduction}</p>
      </header>

      {policiesAreDraft && (
        <aside
          aria-label="Draft policy notice"
          className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
        >
          Draft for review. Complete the operator’s business contact address and
          review this policy before publishing.
        </aside>
      )}

      <section
        aria-labelledby="policy-operator"
        className="border-border mt-8 rounded-2xl border p-5 sm:p-6"
      >
        <h2 id="policy-operator" className="text-primary text-lg font-semibold">
          Operator and contact
        </h2>

        <div className="text-muted mt-3 space-y-2 text-sm leading-7">
          <p>
            {siteDetails.operator}, trading as {siteDetails.name}
          </p>

          <p className="whitespace-pre-line">{siteDetails.businessAddress}</p>

          <p>{siteDetails.country}</p>

          <a
            href={`mailto:${siteDetails.supportEmail}`}
            className="text-primary focus-visible:outline-primary break-all underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {siteDetails.supportEmail}
          </a>
        </div>
      </section>

      <div className="mt-10 space-y-9">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-primary text-lg font-semibold">
              {section.title}
            </h2>

            <div className="text-muted mt-3 space-y-3 text-sm leading-7">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <nav
        aria-label="Policy navigation"
        className="border-border mt-12 flex flex-wrap gap-x-6 gap-y-3 border-t pt-6 text-sm"
      >
        {[
          { href: "/", label: "Browse jobs" },
          { href: "/privacy", label: "Privacy Policy" },
          { href: "/terms", label: "Terms of Service" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-primary focus-visible:outline-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </article>
  );
}
