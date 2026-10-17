import { Suspense } from "react";
import { ExperienceEditor } from "@/components/dashboard/experience-editor";
import { ResetSection } from "@/components/dashboard/reset-section";
import { getEditableExperience } from "@/lib/content-admin";

export default function ExperiencePage({ searchParams }: PageProps<"/dashboard/edit/experience">) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Experience</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Editor({ searchParams }: { searchParams: Promise<{ reset?: string | string[] }> }) {
  // Changing ?reset= remounts the editor after a reset; saves keep the form (and its status message).
  const { reset } = await searchParams;
  const items = await getEditableExperience();
  return (
    <>
      <ExperienceEditor key={String(reset ?? "")} initial={items} />
      <ResetSection section="experience" />
    </>
  );
}
