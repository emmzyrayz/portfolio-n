import { Suspense } from "react";
import { ResetSection } from "@/components/dashboard/reset-section";
import { SkillsEditor } from "@/components/dashboard/skills-editor";
import { getEditableSkills } from "@/lib/content-admin";

export default function SkillsPage({ searchParams }: PageProps<"/dashboard/edit/skills">) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Skills</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Editor({ searchParams }: { searchParams: Promise<{ reset?: string | string[] }> }) {
  // Changing ?reset= remounts the editor after a reset; saves keep the form (and its status message).
  const { reset } = await searchParams;
  const skills = await getEditableSkills();
  return (
    <>
      <SkillsEditor key={String(reset ?? "")} initial={skills} />
      <ResetSection section="skills" />
    </>
  );
}
