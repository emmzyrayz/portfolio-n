import Link from "next/link";
import { Suspense } from "react";
import { NewCvForm } from "@/components/cv/new-cv-form";
import { getSectionStatus } from "@/lib/content-admin";

// Server Actions on this page inherit this limit; a Gemini call can take 10-30 s.
export const maxDuration = 60;

export default function NewCvPage() {
  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <Link href="/dashboard/cv" className="w-fit text-sm font-semibold underline underline-offset-4">
        &larr; All CVs
      </Link>
      <h1 className="text-3xl font-bold">New tailored CV</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Readiness />
      </Suspense>
      <NewCvForm />
    </section>
  );
}

// Reads the session (via getSectionStatus), so it streams in behind Suspense.
async function Readiness() {
  const status = await getSectionStatus();
  const blocked = !status.profile || !status.experience;
  const notes = [!status.skills && "Skills use the default list.", !status.projects && "No featured projects saved (none will be included)."].filter(Boolean);

  return (
    <div className="flex flex-col gap-2 text-sm">
      {blocked && (
        <p className="rounded-md border-2 border-error p-3 text-error">
          Your {[!status.profile && "profile", !status.experience && "experience"].filter(Boolean).join(" and ")} still use the built-in placeholder
          content. <Link href="/dashboard/edit/profile" className="underline">Edit them</Link> first, so the CV is built from your real details.
        </p>
      )}
      {notes.length > 0 && <p className="text-zinc-500">Heads up: {notes.join(" ")}</p>}
      <p className="text-zinc-500">The CV is written only from your saved profile, experience, skills and projects. Nothing is invented.</p>
    </div>
  );
}
