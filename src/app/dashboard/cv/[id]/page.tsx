import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteCvAction, publishCvAction, regenerateCvAction } from "@/app/actions/cv";
import { CvEditor } from "@/components/cv/cv-editor";
import { getCv } from "@/lib/cv-admin";

// Regenerate runs a Gemini call from this page's Server Action (10-30 s).
export const maxDuration = 60;

const secondaryButton =
  "rounded-md border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors duration-300 hover:bg-ink hover:text-paper";

export default function CvPage({ params, searchParams }: PageProps<"/dashboard/cv/[id]">) {
  return (
    <section className="flex flex-col gap-6">
      <Link href="/dashboard/cv" className="w-fit text-sm font-semibold underline underline-offset-4 print:hidden">
        &larr; All CVs
      </Link>
      <Suspense fallback={<p>Loading...</p>}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[]; v?: string | string[] }>;
}) {
  const [{ id }, { error, v }] = await Promise.all([params, searchParams]);
  const cv = await getCv(id); // verifies the owner session
  if (!cv) notFound();

  return (
    <>
      <div className="flex flex-col gap-3 print:hidden">
        <h1 className="text-3xl font-bold">{cv.title}</h1>
        <p className="text-sm text-zinc-500">
          {cv.model ? `Written by ${cv.model} from your saved profile, experience, skills and projects. ` : ""}
          Check every line before sending it anywhere.
        </p>
        {typeof error === "string" && error && <p role="alert" className="rounded-md border-2 border-error p-3 text-sm text-error">{error}</p>}

        <div className="flex flex-wrap items-start gap-2">
          <form action={regenerateCvAction.bind(null, cv.id)}>
            <button type="submit" className={secondaryButton}>
              Regenerate from your latest data
            </button>
          </form>
          <form action={publishCvAction.bind(null, cv.id, !cv.isPublished)}>
            <button type="submit" className={secondaryButton}>
              {cv.isPublished ? "Unpublish" : "Publish as /resume.pdf"}
            </button>
          </form>
          <form action={deleteCvAction.bind(null, cv.id)}>
            <button type="submit" className="rounded-md border-2 border-error px-4 py-2 text-sm font-semibold text-error transition-colors duration-300 hover:bg-error hover:text-paper">
              Delete
            </button>
          </form>
        </div>
        <p className="text-xs text-zinc-500">
          Regenerating replaces the wording below (your education is kept). {cv.isPublished ? (
            <>
              Published: <a href="/resume.pdf" className="underline">/resume.pdf</a> serves this CV. Set your profile&apos;s Resume URL to <code>/resume.pdf</code> to show the Resume button.
            </>
          ) : (
            "Publishing makes this CV downloadable by anyone at /resume.pdf."
          )}
        </p>
      </div>

      <CvEditor key={String(v ?? "")} id={cv.id} initial={cv.content} source={cv.source} />
    </>
  );
}
