import type { Metadata } from "next";
import LegalDocument from "../component/LegalDocument";
import { policiesAreDraft, siteDetails } from "../lib/site-details";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "StackWing service terms, monthly subscription, cancellation, and three-day refund policy.",
  alternates: {
    canonical: "/terms",
  },
  robots: {
    index: !policiesAreDraft,
    follow: true,
  },
};

const sections = [
  {
    title: "1. About StackWing",
    paragraphs: [
      "StackWing is operated by Pyae Sone Paing as an individual trading as StackWing in Thailand. It helps users discover developer jobs, save listings, track applications, and use SmartMatch profile and job-question features.",
      "These Terms describe use of the service and paid subscriptions. Review them before creating an account or purchasing a subscription. Mandatory rights under applicable law are not excluded by these Terms.",
    ],
  },
  {
    title: "2. Your account and use of the service",
    paragraphs: [
      "Provide accurate account information, protect your sign-in credentials, and use only accounts you are authorized to access. You must have the legal capacity or legally required authorization to use the service and enter any subscription agreement.",
      "Do not misuse accounts, interfere with the service, bypass security or usage limits, submit unlawful material, or attempt to access another person’s private information.",
      "Only submit resume text, notes, and other information that you are entitled to provide. Do not include unnecessary sensitive information or other people’s private information without appropriate authority.",
    ],
  },
  {
    title: "3. Job listings and SmartMatch",
    paragraphs: [
      "Job listings originate from third-party sources. Availability, eligibility, location restrictions, descriptions, and application requirements may change. Verify important details with the employer or original listing.",
      "StackWing is not the employer and does not guarantee interviews, employment, earnings, listing accuracy, or suitability. You are responsible for deciding whether to apply and for information you send to external websites.",
      "SmartMatch recommendations use rule-based matching. Resume extraction and job-question answers use AI and may be inaccurate, incomplete, or unsuitable. Review generated profiles and answers before relying on them.",
      "SmartMatch does not make hiring decisions, apply for jobs on your behalf, or provide professional legal, immigration, or employment advice.",
    ],
  },
  {
    title: "4. Pro subscription and price",
    paragraphs: [
      "StackWing Pro is offered at US$1.99 per month, with automatic monthly renewal until cancelled. Before payment, the checkout displays the applicable price, currency, billing information, and any applicable taxes. Your bank or payment provider may impose separate currency-conversion or other fees.",
      "Stripe processes payments. A subscription starts when payment and subscription access are confirmed. Payment failure or an unresolved billing or security issue may prevent or suspend Pro access.",
      "Pro remains subject to request, token, spending, concurrency, and other reasonable service limits. It is not unlimited AI use. Current allowances are displayed in the service, and cancelling or resubscribing does not reset them.",
      "We will notify you before a change to your recurring subscription price takes effect and obtain any authorization required by applicable law. A price change does not retroactively alter a completed charge.",
    ],
  },
  {
    title: "5. Cancelling future renewals",
    paragraphs: [
      "To stop future renewals, open Billing or your profile’s subscription section and use Manage subscription to access the Stripe customer portal. Complete cancellation before the next renewal charge is initiated.",
      "For ordinary cancellation, Pro access continues until the end of the paid period shown in your billing status. Logging out, closing the browser, or simply not using the service does not cancel a subscription.",
      "Cancellation is different from a refund request. Cancelling future renewals does not automatically refund a charge that has already occurred.",
    ],
  },
  {
    title: "6. Three-day refund policy",
    paragraphs: [
      "You may request a full refund of a successful monthly subscription payment within three days of that payment, including every monthly renewal. For this policy, three days means 72 hours from the successful charge timestamp shown in the payment record.",
      `Email ${siteDetails.supportEmail} within that window. Include your account email and enough information to identify the charge, such as the receipt or invoice reference and payment date. Do not send a password, full card number, or CVC.`,
      "A request received within the window remains timely even if we review or process it later. We may verify account ownership and the payment reference before issuing the refund. A charge cannot be refunded twice.",
      "Eligible refunds are processed manually through Stripe to the original payment method where supported. The time for funds to appear depends on Stripe, the payment method, and your bank; we do not promise an immediate credit.",
      "A full refund ends Pro access and stops future subscription renewals once processed and reflected in billing. Our current billing controls may place the account on a billing hold after a full refund; contact support if you later want to subscribe again.",
      "Outside this voluntary 72-hour window, refunds remain available where required by applicable law. This policy does not limit statutory withdrawal, cancellation, refund, or other consumer rights.",
    ],
  },
  {
    title: "7. Account deletion",
    paragraphs: [
      "Full account deletion is different from ordinary subscription cancellation. It disables service access and initiates cancellation and account-data cleanup. It does not preserve remaining Pro access and may require retries to complete.",
      "Deletion does not automatically reverse a payment already made or in progress. To request a refund, follow the refund process; you may still contact support after deletion using your payment reference.",
      "Some records remain for billing, accounting, security, dispute handling, and other applicable obligations, as explained in the Privacy Policy.",
    ],
  },
  {
    title: "8. Availability and restrictions",
    paragraphs: [
      "We may temporarily interrupt features for maintenance, security, provider outages, capacity limits, or other operational reasons. We do not guarantee uninterrupted access or a particular AI response.",
      "We may restrict access where reasonably necessary to address misuse, fraud, payment disputes, legal requirements, or threats to the service. We will provide notice and a way to contact support where appropriate and legally permitted.",
      "If a paid feature is unavailable or the service is discontinued, any cancellation, refund, or other remedy required by applicable law remains available. These Terms do not remove obligations associated with payments already accepted.",
    ],
  },
  {
    title: "9. Content and third-party services",
    paragraphs: [
      "You retain rights you hold in the information you submit. You authorize processing of that information as necessary to provide the features you request, subject to the Privacy Policy and applicable law.",
      "StackWing branding and original service materials belong to their respective rights holders. Job listings, company names, logos, and external materials remain the property of their respective owners.",
      "Authentication, payment, AI, hosting, and external job websites may be subject to their own terms. StackWing is not responsible for an employer’s hiring process, but this does not exclude responsibility that applicable law places on StackWing itself.",
    ],
  },
  {
    title: "10. Responsibility and applicable law",
    paragraphs: [
      "The service provides job-discovery and organizational tools, not a promise of a particular employment outcome. You should independently verify important information and retain your own copies of information you need.",
      "Nothing in these Terms excludes or limits liability, warranties, remedies, or consumer rights that cannot lawfully be excluded or limited.",
      "These Terms are governed by the laws of Thailand to the extent permitted by applicable law. Mandatory consumer protections and rights to bring a claim in another jurisdiction continue to apply where required.",
    ],
  },
  {
    title: "11. Changes and contact",
    paragraphs: [
      "We may update these Terms as the service changes. We will update the date and provide advance notice or obtain further agreement where required for material changes. Changes do not retroactively remove an existing refund entitlement.",
      `For billing, refund, service, or legal questions, contact ${siteDetails.supportEmail}. Privacy requests are addressed in the Privacy Policy.`,
    ],
  },
] as const;

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      introduction="Please review these terms before using StackWing or purchasing Pro. They explain the service, monthly billing, cancellation, and refund requests."
      sections={sections}
    />
  );
}
