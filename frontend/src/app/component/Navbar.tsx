"use client";

import { useState } from "react";
import NavLink from "./NavLink";
import Image from "next/image";
import { CgProfile } from "react-icons/cg";
import { FaCrown } from "react-icons/fa";
import { HiOutlineBars3 } from "react-icons/hi2";

import logo from "../assets/logo.png";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="border-background/10 bg-primary sticky top-0 z-50 border-b">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Image src={logo} alt="Logo" className="h-15 w-auto lg:h-20" priority />

        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isOpen}
          aria-controls="main-navigation"
          className={`text-background focus-visible:outline-background rounded-xl border p-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden ${
            isOpen
              ? "border-background/25 bg-background/15 shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] backdrop-blur-xl"
              : "hover:bg-background/10 border-transparent"
          } `}
        >
          <HiOutlineBars3 className="h-7 w-7" aria-hidden="true" />
        </button>

        <nav
          id="main-navigation"
          aria-label="Main navigation"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) {
              setIsOpen(false);
            }
          }}
          className={` ${isOpen ? "flex" : "hidden"} border-background/40 bg-background/90 absolute inset-x-4 top-full mt-2 flex-col items-stretch gap-1 rounded-2xl border p-2 shadow-[0_4px_20px_rgb(0_0_0/0.15),inset_0_1px_0_rgb(255_255_255/0.5)] backdrop-blur-xl sm:inset-x-6 lg:static lg:mt-0 lg:flex lg:flex-row lg:items-center lg:justify-evenly lg:rounded-full lg:p-1.5 xl:w-1/2`}
        >
          <NavLink href="/jobs">Explore</NavLink>
          <NavLink href="/saved-jobs">Saved</NavLink>
          <NavLink href="/tracker">Application</NavLink>

          <NavLink href="/smart-match">
            <span className="inline-flex items-center gap-2">
              SmartMatch
              <FaCrown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </span>
          </NavLink>

          <NavLink href="/profile">
            <span className="inline-flex items-center gap-2">
              <CgProfile className="h-5 w-5" aria-hidden="true" />
              <span className="lg:sr-only">Profile</span>
            </span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
