import { getFeaturedProjects } from "@/lib/content";
import { getProjects } from "@/lib/github";
import { SectionHeading } from "@/components/section-heading";
import { ProjectsExplorer } from "@/components/projects-explorer";

export async function Projects() {
  // Saved featured projects win; otherwise GitHub, then the static placeholders.
  const projects = (await getFeaturedProjects()) ?? (await getProjects());

  return (
    <section id="projects" className="mx-auto max-w-6xl px-4 py-12 lg:px-8">
      <SectionHeading light="My" bold="Projects" />
      <ProjectsExplorer projects={projects} />
    </section>
  );
}
