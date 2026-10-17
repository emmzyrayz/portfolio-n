import { cacheLife } from "next/cache";
import { fallbackProjects, type Project } from "@/content/projects";

type GitHubRepo = {
  id: number;
  name: string;
  description: string | null;
  homepage: string | null;
  html_url: string;
  language: string | null;
  topics?: string[];
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  created_at: string;
  updated_at: string;
};

/**
 * Cached GitHub fetch. Throws on failure so a transient error is never cached;
 * `getProjects` catches it and serves the static fallback instead.
 */
async function fetchRepoProjects(username: string): Promise<Project[]> {
  "use cache";
  cacheLife("hours");

  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`,
    { headers },
  );
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);

  const repos = (await res.json()) as GitHubRepo[];
  return repos
    .filter((repo) => !repo.fork && !repo.archived && repo.homepage)
    .map((repo) => ({
      id: String(repo.id),
      title: repo.name,
      description: repo.description ?? "No description provided.",
      technologies: [repo.language, ...(repo.topics ?? [])].filter((t): t is string => Boolean(t)).slice(0, 6),
      image: `https://opengraph.githubassets.com/1/${username}/${repo.name}`,
      githubLink: repo.html_url,
      liveLink: repo.homepage ?? undefined,
      stars: repo.stargazers_count,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
    }));
}

/** Projects with a live homepage from GitHub, or the static fallback. */
export async function getProjects(): Promise<Project[]> {
  const username = process.env.GITHUB_USERNAME;
  if (!username) return fallbackProjects;
  try {
    const projects = await fetchRepoProjects(username);
    return projects.length > 0 ? projects : fallbackProjects;
  } catch {
    return fallbackProjects;
  }
}
