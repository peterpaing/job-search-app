import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <section className="bg-background px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto flex max-w-7xl flex-col items-center">
        <div className="mb-8 text-center">
          <h1 className="text-primary text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome back
          </h1>

          <p className="text-muted mt-3 text-sm sm:text-base">
            Sign in to your DVjobs account.
          </p>
        </div>

        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/profile"
        />
      </div>
    </section>
  );
}
