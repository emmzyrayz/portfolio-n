import Link from "next/link";

const sections = [
  { href: "/dashboard/edit/profile", label: "Hero, About & Contact" },
  { href: "/dashboard/edit/skills", label: "Skills" },
  { href: "/dashboard/edit/experience", label: "Experience" },
  { href: "/dashboard/edit/projects", label: "Projects" },
];

// Static shell only: the session is read inside each page's Suspense boundary.
export default function EditLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Edit sections" className="flex flex-wrap gap-2">
        <Link href="/dashboard" className="rounded-md border-2 border-transparent px-3 py-1.5 text-sm font-semibold underline-offset-4 hover:underline">
          &larr; Dashboard
        </Link>
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-md border-2 border-ink px-3 py-1.5 text-sm font-semibold transition-colors duration-300 hover:bg-ink hover:text-paper"
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
