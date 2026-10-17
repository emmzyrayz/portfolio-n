"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { Project } from "@/content/projects";
import { ProjectCard } from "@/components/project-card";

type SortKey = "updated" | "created" | "stars" | "name";

const sorters: Record<SortKey, (a: Project, b: Project) => number> = {
  updated: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  created: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  stars: (a, b) => b.stars - a.stars,
  name: (a, b) => a.title.localeCompare(b.title),
};

export function ProjectsExplorer({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const deferredQuery = useDeferredValue(query);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return projects
      .filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.technologies.some((t) => t.toLowerCase().includes(q)),
      )
      .sort(sorters[sort]);
  }, [projects, deferredQuery, sort]);

  return (
    <>
      <div className="mb-8 flex flex-col items-center justify-between gap-4 md:flex-row">
        <label className="w-full md:w-64">
          <span className="sr-only">Filter projects</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter projects..."
            className="w-full rounded-lg border px-4 py-2"
          />
        </label>
        <label className="w-full md:w-48">
          <span className="sr-only">Sort projects</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-full rounded-lg border px-4 py-2">
            <option value="updated">Last updated</option>
            <option value="created">Newest first</option>
            <option value="stars">Most stars</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">No projects match your search.</p>
      ) : (
        <div className="space-y-16">
          {visible.map((project, i) => (
            <ProjectCard key={project.id} project={project} reversed={i % 2 === 1} />
          ))}
        </div>
      )}
    </>
  );
}
