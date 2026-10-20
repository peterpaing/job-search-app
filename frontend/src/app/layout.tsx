import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "./component/Navbar";
import Footer from "./component/Footer";
import AccountSync from "./component/AccountSync";
import SavedJobsProvider, {
  SavedJobsNotice,
} from "./component/SavedJobsProvider";
import ApplicationsProvider from "./component/ApplicationsProvider";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://stackwingjobs.com"),

  applicationName: "StackWing",

  title: {
    default: "StackWing | Developer Jobs & Application Tracker",
    template: "%s | StackWing",
  },

  description:
    "Discover developer jobs from multiple job boards, save opportunities, track applications, and use SmartMatch to find roles suited to your skills.",

  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "StackWing",
    title: "StackWing | Developer Jobs & Application Tracker",
    description:
      "Explore developer jobs, save opportunities, track applications, and discover roles suited to your skills with SmartMatch.",
  },

  twitter: {
    card: "summary",
    title: "StackWing | Developer Jobs & Application Tracker",
    description:
      "Developer jobs, saved opportunities, application tracking, and SmartMatch—all in one place.",
  },
  icons: {
    icon: [
      {
        url: "/icon.webp",
        type: "image/webp",
        sizes: "64x64",
      },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main-content"
          className="bg-primary text-background fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg px-4 py-3 text-sm font-semibold focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-black"
        >
          Skip to content
        </a>
        <ClerkProvider
          afterSignOutUrl="/"
          localization={{
            signIn: {
              start: {
                title: "Sign in to StackWing",
                subtitle: "Your next opportunity starts here.",
              },
            },
            signUp: {
              start: {
                title: "Join StackWing",
                subtitle: "Create your account to get started.",
              },
            },
          }}
          appearance={{
            variables: {
              colorPrimary: "#171717",
              borderRadius: "1rem",
            },
            elements: {
              headerTitle: {
                fontSize: "1.375rem",
                fontWeight: 600,
                letterSpacing: "-0.025em",
              },
              headerSubtitle: {
                fontSize: "0.875rem",
                color: "#555555",
              },
              card: {
                border: "1px solid #e2e2e2",
                boxShadow: "0 8px 30px rgba(0, 0, 0, 0.05)",
              },
              formButtonPrimary: {
                background: "#171717",
                boxShadow: "none",
              },
            },
          }}
        >
          <SavedJobsProvider>
            <ApplicationsProvider>
              <Navbar />

              <AccountSync />
              <SavedJobsNotice />
              <main id="main-content" tabIndex={-1} className="flex-1">
                {children}
              </main>

              <Footer />
            </ApplicationsProvider>
          </SavedJobsProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
