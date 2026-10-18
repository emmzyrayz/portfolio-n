import Link from "next/link";
import { Suspense } from "react";
import { listCvs } from "@/lib/cv-admin";

export default function CvListPage() {
  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <Link href="/dashboard" className="w-fit text-sm font-semibold underline underline-offset-4">
        &larr; Dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">CV builder</h1>
        <Link
          href="/dashboard/cv/new"
          className="rounded-md border-2 border-ink bg-ink px-5 py-2 font-bold text-paper transition-colors duration-300 hover:bg-paper hover:text-ink"
        >
          New CV
        </Link>
      </div>
      <Suspense fallback={<p>Loading...</p>}>
        <CvList />
      </Suspense>
    </section>
  );
}

async function CvList() {
  const cvs = await listCvs(); // verifies the owner session
  if (cvs.length === 0) {
    return <p className="text-zinc-500">No CVs yet. Paste a job description to generate your first tailored CV.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {cvs.map((cv) => (
        <li key={cv.id}>
          <Link
            href={`/dashboard/cv/${cv.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-ink px-4 py-3 transition-colors duration-300 hover:bg-ink hover:text-paper"
          >
            <span className="font-semibold">{cv.title}</span>
            <span className="flex items-center gap-3 text-xs font-normal opacity-80">
              {cv.isPublished && <span className="rounded-full border px-2 py-0.5 font-semibold">Published</span>}
              {cv.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
