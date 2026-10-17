export type Project = {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  image?: string;
  githubLink?: string;
  liveLink?: string;
  stars: number;
  createdAt: string;
  updatedAt: string;
};

// PLACEHOLDER: used when the GitHub API is unavailable or GITHUB_USERNAME is not set.
export const fallbackProjects: Project[] = [
  {
    id: "placeholder-1",
    title: "Project One",
    description: "PLACEHOLDER - What the project does, who it is for and what makes it interesting.",
    technologies: ["Next.js", "TypeScript", "Tailwind CSS"],
    githubLink: "https://github.com/emmzyrayz",
    stars: 0,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
  },
  {
    id: "placeholder-2",
    title: "Project Two",
    description: "PLACEHOLDER - What the project does, who it is for and what makes it interesting.",
    technologies: ["React", "Node.js", "MongoDB"],
    githubLink: "https://github.com/emmzyrayz",
    stars: 0,
    createdAt: "2024-06-01T00:00:00Z",
    updatedAt: "2025-03-01T00:00:00Z",
  },
  {
    id: "placeholder-3",
    title: "Project Three",
    description: "PLACEHOLDER - What the project does, who it is for and what makes it interesting.",
    technologies: ["NestJS", "PostgreSQL"],
    githubLink: "https://github.com/emmzyrayz",
    stars: 0,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-12-01T00:00:00Z",
  },
];
