import Image from "next/image";
import { HiOutlineMagnifyingGlass, HiOutlineMapPin } from "react-icons/hi2";
import { PiStarFourFill } from "react-icons/pi";
import introImage from "../assets/intro.png";

export default function Intro() {
  return (
    <section className="bg-linear-to-b from-primary from-55% via-muted via-75% to-background to-100% px-4 pt-8 pb-12 sm:px-6 sm:pt-12 sm:pb-20 lg:px-8 lg:pt-16 lg:pb-20">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-around gap-3">
        <h1 className="max-w-xl text-2xl leading-tight font-medium tracking-tight text-background sm:text-3xl lg:text-4xl">
        <span className="typing-text inline-block">
          Find Your Dream Dev Jobs Here{" "}
          <PiStarFourFill
            className="inline-block h-6 w-6 align-middle sm:h-8 sm:w-8"
            aria-hidden="true"
          />
        </span>
      </h1>

      <Image
        src={introImage}
        alt=""
        className="intro-image hidden h-auto shrink-0 object-contain md:block md:w-48 lg:w-90"
        priority
      />
        </div>

        <form
          action="/jobs"
          method="GET"
          role="search"
          aria-label="Search developer jobs"
          className="relative mt-6 flex flex-col gap-3 rounded-3xl border border-border bg-background p-3 shadow-xl shadow-primary/10 sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:p-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
            <HiOutlineMagnifyingGlass
              className="h-5 w-5 shrink-0 text-muted"
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
              className="min-w-0 w-full rounded-xl bg-transparent px-3 py-3 text-sm font-medium text-primary caret-primary placeholder:font-normal placeholder:text-muted transition-colors focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 selection:bg-primary selection:text-background"
            />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3 border-t border-border px-3 pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
            <HiOutlineMapPin
              className="h-5 w-5 shrink-0 text-muted"
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
              className="min-w-0 w-full rounded-xl bg-transparent px-3 py-3 text-sm font-medium text-primary caret-primary placeholder:font-normal placeholder:text-muted transition-colors focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 selection:bg-primary selection:text-background"
            />
          </div>

          <button
          type="submit"
          className="shrink-0 rounded-full bg-primary px-8 py-3 text-sm font-medium text-background transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Search
        </button>
        </form>
      </div>
    </section>
  );
}