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

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Developer Job Search",
  description: "Discover developer jobs and track your applications.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <ClerkProvider
          afterSignOutUrl="/"
          localization={{
            signIn: {
              start: {
                title: "Sign in to Dev Jobs",
                subtitle: "Your next opportunity starts here.",
              },
            },
            signUp: {
              start: {
                title: "Join Dev Jobs",
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
            <Navbar />

            <AccountSync />
            <SavedJobsNotice />

            <main className="flex-1">{children}</main>

            <Footer />
          </SavedJobsProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
