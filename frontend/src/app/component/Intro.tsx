import Image from "next/image";
import { PiStarFourFill } from "react-icons/pi";
import introImage from "../assets/intro.png";
import JobSearch from "./JobSearch";

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

        <JobSearch />
      </div>
    </section>
  );
}
