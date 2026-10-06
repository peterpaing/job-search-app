"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkProps = {
  href: string;
  children: ReactNode;
};

export default function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();

  const isActive =
    pathname === href ||
    (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`
        inline-flex items-center justify-center rounded-full
        border px-4 py-2 text-sm font-medium
        transition-colors duration-200
        focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-primary
        ${
          isActive
            ? "border-primary/10 bg-background/60 text-primary backdrop-blur-xl shadow-[0_2px_8px_rgb(0_0_0/0.06),inset_0_1px_0_rgb(255_255_255/0.7)]"
            : "border-transparent text-muted hover:bg-surface/60 hover:text-primary"
        }
      `}
    >
      {children}
    </Link>
  );
}