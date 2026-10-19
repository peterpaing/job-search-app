import type { Metadata } from "next";
import LegalDocument from "../component/LegalDocument";
import { policiesAreDraft, siteDetails } from "../lib/site-details";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How StackWing handles account information, resumes, SmartMatch data, subscriptions, and privacy requests.",
  alternates: {
    canonical: "/privacy",
  },
  robots: {
    index: !policiesAreDraft,
    follow: true,
  },
};

const sections = [
  {
    title: "1. Information we process",
    paragraphs: [
      "Account information: Clerk manages authentication, including your account identifier, email address, profile information, connected sign-in methods, and sessions. Depending on your chosen provider and settings, this can include your name and profile image. StackWing associates your application data with an internal user identifier and your Clerk identifier.",
      "Job activity: we store saved jobs, application records, statuses, notes, and snapshots of listings associated with tracked applications.",
      "SmartMatch information: we process the developer profile you save, including skills, roles, experience, location preferences, and work preferences. We also maintain AI usage, token and cost accounting, request-control records, and cached generated results.",
      "Billing information: Stripe processes payment details. StackWing stores customer and subscription references, payment-related status, paid-through dates, renewal settings, and records needed to verify access and prevent duplicate processing. StackWing does not store full payment-card numbers or CVCs.",
      "Support and technical information: information you send by email is processed to respond to your request. Hosting, authentication, security, and payment providers may also process IP addresses, browser information, timestamps, and operational logs when delivering their services.",
    ],
  },
  {
    title: "2. Google and other social sign-in",
    paragraphs: [
      "If you choose Google, GitHub, or another available sign-in provider, Clerk processes the identity information authorized by that provider to authenticate you and manage your account. The information depends on the provider and permissions you approve.",
      "Our Google sign-in configuration requests basic identity information: OpenID, email, and profile. It does not request access to your Gmail messages, Google Drive files, or calendar.",
      "We use social sign-in information for account authentication, account management, and related security, not to send your social-provider account data to the AI model or use it for advertising.",
    ],
  },
  {
    title: "3. Resume files and AI requests",
    paragraphs: [
      "TXT and text-based PDF resume files are read locally in your browser. The original file is not uploaded to StackWing by the resume reader. Scanned PDFs and password-protected PDFs are not supported.",
      "After you review the extracted text, confirm consent, and select Extract with AI, that text is sent through StackWing’s backend to OpenAI to produce a draft developer profile. Review the text first and remove contact information or anything you do not want processed. StackWing does not save the raw resume text in its application database.",
      "For job-question chat, we send your question, relevant saved developer-profile information, and the selected job listing to OpenAI. The current chat request does not include previous conversation history.",
      "Generated profile drafts and job answers may be cached privately for your account. OpenAI requests are made with response storage disabled, but this does not mean that all provider logging or retention is disabled. OpenAI’s applicable service terms and data-processing practices govern its handling of API data.",
      "Job recommendations use StackWing’s rule-based matching logic. AI-generated information supports your review; it is not an automated hiring decision about you.",
    ],
  },
  {
    title: "4. Purposes and grounds for processing",
    paragraphs: [
      "We process information to provide requested account, saved-job, application-tracking, SmartMatch, subscription, and support services; protect accounts and the service; prevent fraud and misuse; and meet applicable legal obligations.",
      "Where applicable, these activities rely on performing our agreement with you, legitimate interests in operating and securing the service, legal obligations, or your consent. We obtain a separate confirmation before sending resume text for AI extraction.",
      "You can choose not to use optional AI extraction and enter your profile manually. Account-linked features need an account identifier; paid features need the billing information required by the payment provider. Not providing required information may prevent the corresponding feature from working.",
      "You can withdraw consent for future consent-based processing by stopping the optional feature and contacting us. Withdrawal does not undo processing already lawfully performed.",
    ],
  },
  {
    title: "5. Service providers and disclosures",
    paragraphs: [
      "We use Clerk for authentication, Stripe for payments, OpenAI for requested AI processing, Render for application hosting, Neon for the application database, Cloudflare for domain and DNS services, and Gmail for support correspondence. Their processing depends on the service used and the relevant provider agreement or privacy notice.",
      "Information may also be disclosed where necessary to meet applicable law, respond to valid legal requests, protect rights and security, or resolve fraud and payment disputes.",
      "We do not sell personal information. StackWing does not currently provide a public member-profile directory or submit your saved developer profile to employers on your behalf.",
      "Opening an external job listing takes you to a third-party website. Its operator controls information you submit there under its own privacy notice.",
    ],
  },
  {
    title: "6. International processing",
    paragraphs: [
      "StackWing is operated from Thailand. Our service providers may process information in other countries, including hosting, database, authentication, payment, AI, and support infrastructure outside Thailand.",
      "International processing must be supported by the arrangements and safeguards required by applicable law. Contact us to ask about the arrangements relevant to your information.",
    ],
  },
  {
    title: "7. Retention",
    paragraphs: [
      "Saved jobs, application records, and your saved developer profile remain associated with your account until you remove them or request account deletion, subject to applicable retention obligations.",
      "AI-generated results can be reused from the private cache for up to 24 hours. Expiry stops reuse; it does not guarantee immediate physical deletion. Expired entries may remain until a subsequent AI-generation cleanup or deletion of your SmartMatch data or account.",
      "Account deletion does not erase every record. Limited billing references, subscription records, usage and spending accounting, fraud-prevention information, and deletion markers may remain to handle accounting, legal obligations, disputes, security, and prevention of reactivating a deleted identity.",
      "The current application does not apply an automatic expiry to all retained billing, accounting, and deletion records. Their continued necessity must be reviewed, and you can contact us to request a retention review. Provider-controlled logs, backups, and payment records follow the applicable provider arrangements and legal requirements.",
      "Support correspondence is retained as needed to resolve requests, maintain relevant records, and meet applicable obligations.",
    ],
  },
  {
    title: "8. Cookies and browser storage",
    paragraphs: [
      "Authentication and related providers use cookies or similar technology to maintain sessions and protect accounts. Stripe may use similar technology on its payment pages.",
      "StackWing uses browser session storage for application-visit prompts, including temporarily remembering listings you visited. Clearing browser storage can remove these prompts and may require signing in again.",
      "This policy does not treat use of the website as blanket consent to optional advertising or analytics tracking. Any such functionality introduced later will need an appropriate notice and consent mechanism where required.",
    ],
  },
  {
    title: "9. Deletion and your choices",
    paragraphs: [
      "You can remove saved jobs and application records through the service and delete your SmartMatch profile and cached results through the account privacy controls. Deleting only SmartMatch data does not cancel your subscription or necessarily remove usage accounting.",
      "Full account deletion is a separate process. It disables access, attempts to stop subscription billing, deletes the Clerk account, and removes or anonymizes applicable application data. Processing can require retries and is not necessarily instantaneous.",
      "Deleting an account or cancelling a subscription does not automatically refund a payment. The refund process is described in the Terms of Service.",
      "Depending on applicable law, you may have rights to access or obtain a copy of your information, correct it, request deletion, restrict or object to processing, receive portable information, withdraw consent, or complain to a competent data-protection authority, including Thailand’s Personal Data Protection Committee where applicable.",
      `Send privacy requests to ${siteDetails.supportEmail}. We may need proportionate information to verify your identity and locate your records. Do not email passwords, full payment-card details, or unnecessary identification documents.`,
    ],
  },
  {
    title: "10. Security, minors, and updates",
    paragraphs: [
      "We use access controls and operational safeguards intended to protect information, but no online service can guarantee absolute security. Keep your sign-in credentials secure and report suspected unauthorized access.",
      "The service is intended for people seeking employment who can lawfully use the service and, where relevant, enter a subscription agreement. If you believe a child has submitted information without legally required authorization, contact us so we can assess and address it.",
      "We may update this notice when the service or processing changes. We will update the date and provide additional notice or obtain consent where required. Material changes do not remove rights you already have under applicable law.",
    ],
  },
] as const;

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      introduction="This notice explains how Pyae Sone Paing, trading as StackWing, handles personal information when you use stackwingjobs.com and its related services."
      sections={sections}
    />
  );
}
