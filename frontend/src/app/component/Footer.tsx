import Image from "next/image";
import Link from "next/link";
import logo from "../assets/logo.png";

const sources = [
  { name: "Himalayas", url: "https://himalayas.app" },
  { name: "Dev Global Jobs", url: "https://devglobaljobs.com" },
  { name: "We Work Remotely", url: "https://weworkremotely.com" },
  { name: "Remote OK", url: "https://remoteok.com" },
];

const navigation = [
  { name: "Home", href: "/" },
  { name: "Developer jobs", href: "/jobs" },
  { name: "Saved jobs", href: "/saved-jobs" },
  { name: "Application tracker", href: "/tracker" },
];

const linkClass =
  "text-background/70 hover:text-background focus-visible:outline-background inline-block rounded-sm py-1 text-sm leading-relaxed transition-colors focus-visible:outline-2 focus-visible:outline-offset-4";

export default function Footer() {
  return (
    <footer className="bg-primary text-background border-background/10 border-t">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-[1.2fr_1fr_1fr] md:gap-8 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              aria-label="DVjobs home"
              className="focus-visible:outline-background inline-block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <Image src={logo} alt="DVjobs" className="h-12 w-auto lg:h-14" />
            </Link>

            <p className="text-background/70 mt-2 max-w-60 text-sm leading-relaxed">
              Developer jobs, in one place.
            </p>
          </div>

          <nav aria-label="Footer navigation" className="min-w-0">
            <h2 className="text-sm font-semibold">Explore</h2>

            <ul className="mt-3 space-y-1">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass}>
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Job sources</h2>

            <ul className="mt-3 space-y-1">
              {sources.map((source) => (
                <li key={source.name}>
                  <Link
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${source.name} (opens in a new tab)`}
                    className={linkClass}
                  >
                    {source.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-background/15 text-background/60 mt-6 flex flex-col items-center gap-2 border-t pt-5 text-center text-xs leading-relaxed sm:mt-8 sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
          <p className="shrink-0">© {new Date().getFullYear()} DVjobs.</p>

          <p className="max-w-72 sm:max-w-none sm:text-right">
            Job listings belong to their respective sources.
          </p>
        </div>
      </div>
    </footer>
  );
}
