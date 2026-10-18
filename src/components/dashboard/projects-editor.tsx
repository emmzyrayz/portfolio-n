"use client";

import { useActionState, useState } from "react";
import { saveProjectsAction, type ContentState } from "@/app/actions/content";
import type { EditableProjects } from "@/lib/content-admin";
import type { GithubRepo } from "@/lib/github-repos";
import { SaveBar, TextField, fieldClass, smallButtonClass } from "./editor-ui";

const initialState: ContentState = { status: "idle" };

type Row = {
  id: string; // stable React key / DOM id
  repo?: string; // "owner/name" when it comes from GitHub
  isPrivate: boolean;
  visible: boolean;
  title: string;
  description: string;
  technologies: string; // comma separated while editing
  imageUrl: string;
  githubLink: string;
  liveLink: string;
};

const fromRepo = (r: GithubRepo) => ({
  repo: r.fullName,
  isPrivate: r.isPrivate,
  title: r.name,
  description: r.description,
  technologies: r.technologies.join(", "),
  imageUrl: r.image ?? "",
  githubLink: r.githubLink ?? "",
  liveLink: r.liveLink ?? "",
});

const domId = (id: string) => id.replace(/[^\w-]/g, "_");

function Badge({ children, tone }: { children: string; tone: "private" | "public" | "muted" }) {
  const cls =
    tone === "private" ? "border-error text-error" : tone === "public" ? "border-ink text-ink" : "border-zinc-400 text-zinc-500";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export function ProjectsEditor({ data }: { data: EditableProjects }) {
  const [state, action, pending] = useActionState(saveProjectsAction, initialState);
  const errors = state.fieldErrors ?? {};

  const repos = data.github.status === "ok" ? data.github.repos : [];
  const repoByName = new Map(repos.map((r) => [r.fullName.toLowerCase(), r]));

  const [rows, setRows] = useState<Row[]>(() => {
    const saved: Row[] = data.saved.map((p, i) => ({
      id: p.repo ?? `manual-${i}`,
      repo: p.repo,
      // GitHub is the source of truth for visibility when it is reachable
      isPrivate: (p.repo ? repoByName.get(p.repo.toLowerCase())?.isPrivate : undefined) ?? p.isPrivate,
      visible: true,
      title: p.title,
      description: p.description,
      technologies: p.technologies.join(", "),
      imageUrl: p.imageUrl ?? "",
      githubLink: p.githubLink ?? "",
      liveLink: p.liveLink ?? "",
    }));
    const taken = new Set(saved.map((r) => r.repo?.toLowerCase()));
    const hidden: Row[] = repos
      .filter((r) => !taken.has(r.fullName.toLowerCase()))
      .map((r) => ({ id: r.fullName, visible: false, ...fromRepo(r) }));
    return [...saved, ...hidden];
  });
  const [search, setSearch] = useState("");

  const visible = rows.filter((r) => r.visible);
  const candidates = rows.filter(
    (r) => !r.visible && r.repo && (search.trim() === "" || r.repo.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const update = (id: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Visible rows are kept first, in display order; hidden repos follow.
  const regroup = (all: Row[]) => [...all.filter((r) => r.visible), ...all.filter((r) => !r.visible)];

  const show = (id: string) => setRows((all) => regroup(all.map((r) => (r.id === id ? { ...r, visible: true } : r))));
  const hide = (id: string) =>
    setRows((all) => regroup(all.filter((r) => r.repo || r.id !== id).map((r) => (r.id === id ? { ...r, visible: false } : r))));
  const move = (id: string, delta: -1 | 1) =>
    setRows((all) => {
      const vis = all.filter((r) => r.visible);
      const from = vis.findIndex((r) => r.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= vis.length) return all;
      [vis[from], vis[to]] = [vis[to], vis[from]];
      return [...vis, ...all.filter((r) => !r.visible)];
    });
  const resync = (id: string) => {
    const row = rows.find((r) => r.id === id);
    const gh = row?.repo ? repoByName.get(row.repo.toLowerCase()) : undefined;
    if (gh) update(id, fromRepo(gh));
  };
  const addCustom = () =>
    setRows((all) =>
      regroup([
        ...all,
        { id: `manual-${crypto.randomUUID()}`, isPrivate: false, visible: true, title: "", description: "", technologies: "", imageUrl: "", githubLink: "", liveLink: "" },
      ]),
    );

  const payload = JSON.stringify(
    visible.map((r) => ({
      title: r.title,
      description: r.description,
      technologies: r.technologies
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      imageUrl: r.imageUrl,
      githubLink: r.isPrivate ? "" : r.githubLink,
      liveLink: r.liveLink,
      repo: r.repo ?? "",
      isPrivate: r.isPrivate,
    })),
  );

  const privateCount = repos.filter((r) => r.isPrivate).length;

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-8">
      <input type="hidden" name="payload" value={payload} />

      <div role="status" className="rounded-md border-2 border-zinc-300 p-3 text-sm">
        {data.github.status === "ok" && (
          <>
            Loaded <b>{repos.length}</b> repositories from GitHub ({repos.length - privateCount} public, {privateCount} private). Pick which
            ones appear on your portfolio. A private project shows only its live URL, never a GitHub link.
          </>
        )}
        {data.github.status === "no-token" && <>No <code>GITHUB_TOKEN</code> is configured, so GitHub import is off. You can still add projects by hand.</>}
        {data.github.status === "error" && <span className="text-error">GitHub import failed: {data.github.message} You can still edit by hand.</span>}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">On your portfolio ({visible.length})</h2>
        {visible.length === 0 && <p className="text-sm text-zinc-500">Nothing selected yet. Show a repository below or add a custom project.</p>}

        {visible.map((row, vi) => {
          const base = domId(row.id);
          const gh = row.repo ? repoByName.get(row.repo.toLowerCase()) : undefined;
          return (
            <fieldset key={row.id} className="flex flex-col gap-3 rounded-lg border-2 border-zinc-300 p-4">
              <legend className="flex flex-wrap items-center gap-2 px-1 text-sm font-bold">
                {row.repo ?? "Custom project"}
                {row.repo && <Badge tone={row.isPrivate ? "private" : "public"}>{row.isPrivate ? "Private" : "Public"}</Badge>}
              </legend>

              <TextField id={`${base}-title`} label="Title" value={row.title} onChange={(v) => update(row.id, { title: v })} error={errors[`${vi}.title`]} />
              <TextField id={`${base}-desc`} label="Description" value={row.description} onChange={(v) => update(row.id, { description: v })} error={errors[`${vi}.description`]} multiline />
              <TextField
                id={`${base}-tech`}
                label="Technologies (comma separated)"
                value={row.technologies}
                onChange={(v) => update(row.id, { technologies: v })}
                error={Object.entries(errors).find(([k]) => k.startsWith(`${vi}.technologies`))?.[1]}
              />
              <TextField id={`${base}-image`} label="Image URL (https://... or /images/...)" value={row.imageUrl} onChange={(v) => update(row.id, { imageUrl: v })} error={errors[`${vi}.imageUrl`]} />
              <TextField
                id={`${base}-live`}
                label={row.isPrivate ? "Live URL (required for private projects)" : "Live URL"}
                value={row.liveLink}
                onChange={(v) => update(row.id, { liveLink: v })}
                error={errors[`${vi}.liveLink`]}
              />
              {row.isPrivate ? (
                <p className="text-sm text-zinc-500">Private repository: visitors only get the live URL. No GitHub link is shown.</p>
              ) : (
                <TextField id={`${base}-gh`} label="GitHub link" value={row.githubLink} onChange={(v) => update(row.id, { githubLink: v })} error={errors[`${vi}.githubLink`]} />
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => move(row.id, -1)} disabled={vi === 0} className={smallButtonClass}>
                  Move up
                </button>
                <button type="button" onClick={() => move(row.id, 1)} disabled={vi === visible.length - 1} className={smallButtonClass}>
                  Move down
                </button>
                {gh && (
                  <button type="button" onClick={() => resync(row.id)} className={smallButtonClass}>
                    Re-sync from GitHub
                  </button>
                )}
                <button type="button" onClick={() => hide(row.id)} className={smallButtonClass}>
                  {row.repo ? "Hide" : "Remove"}
                </button>
              </div>
            </fieldset>
          );
        })}

        {errors[""] && <p className="text-sm text-error">{errors[""]}</p>}
        <button type="button" onClick={addCustom} className={`${smallButtonClass} w-fit`}>
          Add custom project
        </button>
      </section>

      {repos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Your GitHub repositories</h2>
          <input
            type="search"
            aria-label="Search repositories"
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={fieldClass}
          />
          {candidates.length === 0 && <p className="text-sm text-zinc-500">No hidden repositories match.</p>}
          <ul className="flex flex-col gap-2">
            {candidates.map((row) => {
              const gh = repoByName.get(row.repo!.toLowerCase());
              return (
                <li key={row.id} className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{row.repo}</span>
                      <Badge tone={row.isPrivate ? "private" : "public"}>{row.isPrivate ? "Private" : "Public"}</Badge>
                      {gh?.isFork && <Badge tone="muted">Fork</Badge>}
                      {gh?.isArchived && <Badge tone="muted">Archived</Badge>}
                    </div>
                    {row.description && <p className="truncate text-sm text-zinc-500">{row.description}</p>}
                    <p className="text-xs text-zinc-500">
                      {row.technologies || "No languages detected"}
                      {row.liveLink ? ` · ${row.liveLink}` : row.isPrivate ? " · no live URL yet (add one after showing it)" : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => show(row.id)} className={`${smallButtonClass} shrink-0`}>
                    Show on portfolio
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-zinc-500">
            Showing a private repository publishes its title, description and live URL on your public site (not its code or GitHub link).
          </p>
        </section>
      )}

      <SaveBar pending={pending} state={state} />
    </form>
  );
}
