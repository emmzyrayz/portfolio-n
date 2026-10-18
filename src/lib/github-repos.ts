import "server-only";

/**
 * Owner-only GitHub import (public AND private repos). Uses the viewer's token, so it must
 * only be called behind verifyOwner(). Private repos never expose their GitHub URL or a
 * GitHub-generated image: those would leak the repo's existence/location on the public site.
 */

export type GithubRepo = {
  fullName: string;
  name: string;
  description: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  stars: number;
  createdAt: string;
  updatedAt: string;
  technologies: string[];
  liveLink?: string;
  /** Public repos only. */
  githubLink?: string;
  /** Public repos only. */
  image?: string;
};

export type GithubReposResult =
  | { status: "ok"; repos: GithubRepo[] }
  | { status: "no-token" }
  | { status: "error"; message: string };

type GraphqlRepo = {
  nameWithOwner: string;
  name: string;
  description: string | null;
  homepageUrl: string | null;
  url: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  stargazerCount: number;
  createdAt: string;
  updatedAt: string;
  primaryLanguage: { name: string } | null;
  languages: { nodes: { name: string }[] };
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  usesCustomOpenGraphImage: boolean;
  openGraphImageUrl: string;
};

type GraphqlResponse = {
  data?: {
    viewer: {
      repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GraphqlRepo[] };
    };
  };
  errors?: { message: string }[];
};

const QUERY = `
query($after: String) {
  viewer {
    repositories(ownerAffiliations: OWNER, first: 100, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        nameWithOwner name description homepageUrl url isPrivate isFork isArchived stargazerCount createdAt updatedAt
        primaryLanguage { name }
        languages(first: 6, orderBy: { field: SIZE, direction: DESC }) { nodes { name } }
        repositoryTopics(first: 10) { nodes { topic { name } } }
        usesCustomOpenGraphImage
        openGraphImageUrl
      }
    }
  }
}`;

const MAX_PAGES = 5;

/** http(s) only; bare domains from the GitHub "website" field get https://. */
function normalizeUrl(value: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const candidate = /^https?:\/\//i.test(raw) ? raw : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw) ? `https://${raw}` : undefined;
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function toRepo(r: GraphqlRepo): GithubRepo {
  const technologies = [
    ...new Set(
      [r.primaryLanguage?.name, ...r.languages.nodes.map((l) => l.name), ...r.repositoryTopics.nodes.map((t) => t.topic.name)].filter(
        (t): t is string => Boolean(t),
      ),
    ),
  ].slice(0, 10);

  const repo: GithubRepo = {
    fullName: r.nameWithOwner,
    name: r.name,
    description: r.description ?? "",
    isPrivate: r.isPrivate,
    isFork: r.isFork,
    isArchived: r.isArchived,
    stars: r.stargazerCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    technologies,
    liveLink: normalizeUrl(r.homepageUrl),
  };

  if (!r.isPrivate) {
    repo.githubLink = r.url;
    repo.image = r.usesCustomOpenGraphImage
      ? r.openGraphImageUrl
      : `https://opengraph.githubassets.com/1/${r.nameWithOwner}`;
  }
  return repo;
}

/** One GraphQL request per 100 repos (no N+1 language calls). Never cached: owner-only and rare. */
export async function fetchGithubRepos(): Promise<GithubReposResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { status: "no-token" };

  const repos: GithubRepo[] = [];
  let after: string | null = null;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res: Response = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "portfolio-dashboard" },
        body: JSON.stringify({ query: QUERY, variables: { after } }),
        cache: "no-store",
      });
      if (res.status === 401) return { status: "error", message: "GitHub rejected the token (401). Check GITHUB_TOKEN." };
      if (!res.ok) return { status: "error", message: `GitHub responded ${res.status}.` };

      const json = (await res.json()) as GraphqlResponse;
      if (json.errors?.length || !json.data) {
        return { status: "error", message: json.errors?.[0]?.message ?? "GitHub returned no data." };
      }

      const { nodes, pageInfo } = json.data.viewer.repositories;
      repos.push(...nodes.map(toRepo));
      if (!pageInfo.hasNextPage) break;
      after = pageInfo.endCursor;
    }
  } catch (error) {
    console.error("GitHub import failed:", error);
    return { status: "error", message: "Could not reach GitHub." };
  }

  return { status: "ok", repos };
}
