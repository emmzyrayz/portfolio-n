import { Suspense } from "react";
import { ProjectsEditor } from "@/components/dashboard/projects-editor";
import { ResetSection } from "@/components/dashboard/reset-section";
import { getEditableProjects } from "@/lib/content-admin";

export default function ProjectsPage({ searchParams }: PageProps<"/dashboard/edit/projects">) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Featured projects</h1>
      <p className="max-w-2xl text-sm text-zinc-500">
        Choose which of your GitHub repositories (public and private) appear on the public site. Once you save, your selection replaces the automatic public-repo list. Reset to go back to it.
      </p>
      <Suspense fallback={<p>Loading...</p>}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Editor({ searchParams }: { searchParams: Promise<{ reset?: string | string[] }> }) {
  // Changing ?reset= remounts the editor after a reset; saves keep the form (and its status message).
  const { reset } = await searchParams;
  const data = await getEditableProjects(); // verifies the owner session, then reads DB + GitHub
  return (
    <>
      <ProjectsEditor key={String(reset ?? "")} data={data} />
      <ResetSection section="projects" />
    </>
  );
}
