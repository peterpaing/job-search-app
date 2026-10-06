import Image from "next/image";
import { HiOutlineMagnifyingGlass, HiOutlineMapPin } from "react-icons/hi2";
import { PiStarFourFill } from "react-icons/pi";
import introImage from "../assets/intro.png";

export default function Intro() {
  return (
    <section className="from-primary via-muted to-background bg-linear-to-b from-50% via-76% to-100% px-4 pt-10 pb-6 sm:px-6 sm:pt-8 sm:pb-12 lg:px-8 lg:pt-8 lg:pb-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-around gap-6">
          <div className="min-w-0">
            <h1 className="text-background text-2xl leading-tight font-medium tracking-tight sm:text-3xl lg:text-4xl">
              <span className="typing-text inline-block">
                Find Dev Jobs that Actually Fit You{" "}
                <PiStarFourFill
                  className="inline-block h-6 w-4 align-middle sm:h-8 sm:w-6"
                  aria-hidden="true"
                />
              </span>
            </h1>

            <p className="typing-text text-background/70 mt-4 text-sm leading-relaxed sm:text-base">
              Search multiple job boards. Save opportunities. Track
              applications.
            </p>
          </div>

          <Image
            src={introImage}
            alt=""
            className="intro-image hidden h-40 w-auto shrink-0 object-contain md:block lg:h-48"
            priority
          />
        </div>

        <form
          action="/jobs"
          method="GET"
          role="search"
          aria-label="Search developer jobs"
          className="border-border bg-background shadow-primary/10 relative mt-6 flex flex-col gap-3 rounded-3xl border p-3 shadow-xl sm:mt-8 sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:p-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
            <HiOutlineMagnifyingGlass
              className="text-muted h-5 w-5 shrink-0"
              aria-hidden="true"
            />

            <label htmlFor="job-keyword" className="sr-only">
              Job title or keyword
            </label>

            <input
              id="job-keyword"
              name="q"
              type="search"
              placeholder="Job title or keyword"
              className="text-primary caret-primary placeholder:text-muted focus:bg-surface focus:ring-primary/20 selection:bg-primary selection:text-background w-full min-w-0 rounded-xl bg-transparent px-3 py-3 text-sm font-medium transition-colors placeholder:font-normal focus:ring-2 focus:outline-none"
            />
          </div>

          <div className="border-border flex min-w-0 flex-1 items-center gap-3 border-t px-3 pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
            <HiOutlineMapPin
              className="text-muted h-5 w-5 shrink-0"
              aria-hidden="true"
            />

            <label htmlFor="job-location" className="sr-only">
              Country or city
            </label>

            <input
              id="job-location"
              name="location"
              type="text"
              placeholder="Add country or city"
              className="text-primary caret-primary placeholder:text-muted focus:bg-surface focus:ring-primary/20 selection:bg-primary selection:text-background w-full min-w-0 rounded-xl bg-transparent px-3 py-3 text-sm font-medium transition-colors placeholder:font-normal focus:ring-2 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-background hover:bg-muted focus-visible:outline-primary shrink-0 rounded-full px-8 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Search
          </button>
        </form>
      </div>
    </section>
  );
}
