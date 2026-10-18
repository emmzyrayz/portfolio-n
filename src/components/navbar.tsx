"use client";

import Link from "next/link";
import { useState } from "react";
import { LuDownload, LuMenu, LuX } from "react-icons/lu";
import { navLinks } from "@/content/profile";

const linkClass =
  "transition-transform duration-300 ease-in-out hover:-translate-y-1 hover:scale-105 focus-visible:-translate-y-1";

type NavbarProps = { fullName: string; resumeUrl?: string };

export function Navbar({ fullName, resumeUrl }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-paper/90 backdrop-blur print:hidden">
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:px-8 lg:py-4">
        <Link href="/" onClick={close} className="text-base font-extrabold transition-transform duration-300 hover:scale-105 lg:text-lg">
          {fullName}
        </Link>

        <ul className="hidden items-center gap-6 text-lg font-semibold md:flex lg:gap-8">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href} className={`inline-block ${linkClass}`}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {resumeUrl && (
          <a
            href={resumeUrl}
            download
            className="hidden items-center gap-2 rounded border border-ink bg-ink px-4 py-2 font-semibold text-paper transition-colors duration-300 hover:bg-paper hover:text-ink md:flex"
          >
            Resume <LuDownload aria-hidden="true" />
          </a>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="-mr-2 p-2 text-2xl md:hidden"
        >
          {open ? <LuX aria-hidden="true" /> : <LuMenu aria-hidden="true" />}
        </button>
      </nav>

      <div id="mobile-menu" hidden={!open} className="border-t border-zinc-200 bg-paper md:hidden">
        <ul className="mx-auto max-w-7xl px-2 py-2 text-lg font-semibold">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href} onClick={close} className="block rounded p-3 hover:bg-zinc-100">
                {link.label}
              </a>
            </li>
          ))}
          {resumeUrl && (
            <li>
              <a href={resumeUrl} download onClick={close} className="block rounded p-3 hover:bg-zinc-100">
                Resume
              </a>
            </li>
          )}
        </ul>
      </div>
    </header>
  );
}
