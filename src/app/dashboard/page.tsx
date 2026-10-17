import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { getSectionStatus } from "@/lib/content-admin";
import { verifySession } from "@/lib/dal";

const sections = [
  { key: "profile", href: "/dashboard/edit/profile", label: "Hero, About & Contact" },
  { key: "skills", href: "/dashboard/edit/skills", label: "Skills" },
  { key: "experience", href: "/dashboard/edit/experience", label: "Experience" },
  { key: "projects", href: "/dashboard/edit/projects", label: "Featured projects" },
] as const;

export default function DashboardPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Overview />
    </Suspense>
  );
}

// Reads the session cookie, so it streams in behind the Suspense boundary.
async function Overview() {
  const session = await verifySession();
  const status = await getSectionStatus();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p>Signed in as {session.email}.</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Edit your portfolio</h2>
        <ul className="flex flex-col gap-2">
          {sections.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className="flex items-center justify-between gap-3 rounded-md border-2 border-ink px-4 py-3 font-semibold transition-colors duration-300 hover:bg-ink hover:text-paper"
              >
                {s.label}
                <span className="text-xs font-normal opacity-70">{status[s.key] ? "Customised" : "Using defaults"}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/" className="w-fit text-sm font-semibold underline underline-offset-4">
          View public site
        </Link>
      </section>

      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border-2 border-ink px-6 py-2.5 font-bold transition-colors duration-300 hover:bg-ink hover:text-paper"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
