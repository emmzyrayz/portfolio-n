import { Suspense } from "react";
import { ProjectsEditor } from "@/components/dashboard/projects-editor";
import { ResetSection } from "@/components/dashboard/reset-section";
import { getEditableProjects } from "@/lib/content-admin";

export default function ProjectsPage({ searchParams }: PageProps<"/dashboard/edit/projects">) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Featured projects</h1>
      <p className="max-w-2xl text-sm text-zinc-500">
        Once you save, these replace the automatic GitHub list on the public site. Reset to go back to GitHub.
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
  const projects = await getEditableProjects();
  return (
    <>
      <ProjectsEditor key={String(reset ?? "")} initial={projects} />
      <ResetSection section="projects" />
    </>
  );
}
