"use client";

import { useActionState, useMemo, useState } from "react";
import { saveCvAction, type CvState } from "@/app/actions/cv";
import { RowShell, SaveBar, TextField, smallButtonClass } from "@/components/dashboard/editor-ui";
import { computeFlags } from "@/lib/cv-ground";
import type { CvContent, CvSource } from "@/lib/cv-schemas";
import { CvPreview } from "./cv-preview";

const initialState: CvState = { status: "idle" };

type Draft = {
  header: { fullName: string; title: string; email: string; location: string; links: { label: string; url: string }[] };
  headline: string;
  summary: string;
  skills: { group: string; itemsText: string }[];
  experience: { sourceId?: string; role: string; company: string; period: string; bulletsText: string }[];
  projects: { sourceId?: string; title: string; technologiesText: string; liveLink: string; bulletsText: string }[];
  education: { institution: string; qualification: string; period: string }[];
};

const splitList = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
const splitLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function toDraft(c: CvContent): Draft {
  return {
    header: { ...c.header, links: c.header.links.map((l) => ({ ...l })) },
    headline: c.headline,
    summary: c.summary,
    skills: c.skills.map((g) => ({ group: g.group, itemsText: g.items.join(", ") })),
    experience: c.experience.map((e) => ({ sourceId: e.sourceId, role: e.role, company: e.company, period: e.period, bulletsText: e.bullets.join("\n") })),
    projects: c.projects.map((p) => ({
      sourceId: p.sourceId,
      title: p.title,
      technologiesText: p.technologies.join(", "),
      liveLink: p.liveLink ?? "",
      bulletsText: p.bullets.join("\n"),
    })),
    education: c.education.map((e) => ({ ...e })),
  };
}

function toContent(d: Draft): CvContent {
  return {
    header: d.header,
    headline: d.headline,
    summary: d.summary,
    skills: d.skills.map((g) => ({ group: g.group, items: splitList(g.itemsText) })),
    experience: d.experience.map((e) => ({ sourceId: e.sourceId, role: e.role, company: e.company, period: e.period, bullets: splitLines(e.bulletsText) })),
    projects: d.projects.map((p) => ({
      sourceId: p.sourceId,
      title: p.title,
      technologies: splitList(p.technologiesText),
      liveLink: p.liveLink.trim() || undefined,
      bullets: splitLines(p.bulletsText),
    })),
    education: d.education,
  };
}

const update = <T,>(arr: T[], i: number, patch: Partial<T>) => arr.map((x, k) => (k === i ? { ...x, ...patch } : x));
const remove = <T,>(arr: T[], i: number) => arr.filter((_, k) => k !== i);
const move = <T,>(arr: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function flagLabel(path: string, c: CvContent) {
  const [section, idx] = path.split(".");
  const i = Number(idx);
  if (section === "headline" || section === "summary") return section[0].toUpperCase() + section.slice(1);
  if (section === "experience") return `Experience: ${c.experience[i]?.role ?? ""}`;
  if (section === "projects") return `Project: ${c.projects[i]?.title ?? ""}`;
  if (section === "skills") return "Skills";
  return path;
}

export function CvEditor({ id, initial, source }: { id: string; initial: CvContent; source: CvSource }) {
  const [state, action, pending] = useActionState(saveCvAction.bind(null, id), initialState);
  const errors = state.fieldErrors ?? {};
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const patch = (fn: (d: Draft) => Draft) => setDraft(fn);

  const content = useMemo(() => toContent(draft), [draft]);
  const flags = useMemo(() => computeFlags(content, source), [content, source]);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form action={action} className="flex flex-col gap-8 print:hidden">
        <input type="hidden" name="payload" value={JSON.stringify(content)} />

        {flags.length > 0 && (
          <section aria-label="Claims to verify" className="rounded-md border-2 border-error p-3 text-sm">
            <h2 className="mb-1 font-bold text-error">Not found in your data ({flags.length})</h2>
            <p className="mb-2 text-zinc-600">
              These details are not in your saved profile, experience, skills or projects. Verify each one is true, or edit it out, before
              you use this CV.
            </p>
            <ul className="flex flex-col gap-1.5">
              {flags.map((f) => (
                <li key={f.path}>
                  <b>{flagLabel(f.path, content)}:</b> <span className="text-zinc-600">&ldquo;{f.text.slice(0, 90)}{f.text.length > 90 ? "..." : ""}&rdquo;</span>{" "}
                  <span className="font-semibold text-error">{f.unknown.join(", ")}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Header</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="h-name" label="Name" value={draft.header.fullName} onChange={(v) => patch((d) => ({ ...d, header: { ...d.header, fullName: v } }))} error={errors["header.fullName"]} />
            <TextField id="h-title" label="Title" value={draft.header.title} onChange={(v) => patch((d) => ({ ...d, header: { ...d.header, title: v } }))} error={errors["header.title"]} />
            <TextField id="h-email" label="Email" type="email" value={draft.header.email} onChange={(v) => patch((d) => ({ ...d, header: { ...d.header, email: v } }))} error={errors["header.email"]} />
            <TextField id="h-loc" label="Location" value={draft.header.location} onChange={(v) => patch((d) => ({ ...d, header: { ...d.header, location: v } }))} error={errors["header.location"]} />
          </div>
          {draft.header.links.map((l, i) => (
            <RowShell
              key={i}
              title="Link"
              index={i}
              count={draft.header.links.length}
              onMove={(dir) => patch((d) => ({ ...d, header: { ...d.header, links: move(d.header.links, i, dir) } }))}
              onRemove={() => patch((d) => ({ ...d, header: { ...d.header, links: remove(d.header.links, i) } }))}
            >
              <TextField id={`h-ll-${i}`} label="Label" value={l.label} onChange={(v) => patch((d) => ({ ...d, header: { ...d.header, links: update(d.header.links, i, { label: v }) } }))} error={errors[`header.links.${i}.label`]} />
              <TextField id={`h-lu-${i}`} label="URL" value={l.url} onChange={(v) => patch((d) => ({ ...d, header: { ...d.header, links: update(d.header.links, i, { url: v }) } }))} error={errors[`header.links.${i}.url`]} />
            </RowShell>
          ))}
          <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => patch((d) => ({ ...d, header: { ...d.header, links: [...d.header.links, { label: "", url: "" }] } }))}>
            Add link
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Headline &amp; summary</h2>
          <TextField id="c-headline" label="Headline" value={draft.headline} onChange={(v) => patch((d) => ({ ...d, headline: v }))} error={errors.headline} />
          <TextField id="c-summary" label="Summary" value={draft.summary} onChange={(v) => patch((d) => ({ ...d, summary: v }))} error={errors.summary} multiline />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Skills</h2>
          {draft.skills.map((g, i) => (
            <RowShell key={i} title="Group" index={i} count={draft.skills.length} onMove={(dir) => patch((d) => ({ ...d, skills: move(d.skills, i, dir) }))} onRemove={() => patch((d) => ({ ...d, skills: remove(d.skills, i) }))}>
              <TextField id={`s-g-${i}`} label="Group name" value={g.group} onChange={(v) => patch((d) => ({ ...d, skills: update(d.skills, i, { group: v }) }))} error={errors[`skills.${i}.group`]} />
              <TextField id={`s-i-${i}`} label="Skills (comma separated)" value={g.itemsText} onChange={(v) => patch((d) => ({ ...d, skills: update(d.skills, i, { itemsText: v }) }))} />
            </RowShell>
          ))}
          <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => patch((d) => ({ ...d, skills: [...d.skills, { group: "", itemsText: "" }] }))}>
            Add skill group
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Experience</h2>
          {draft.experience.map((e, i) => (
            <RowShell key={i} title={e.sourceId ? "Role" : "Role (typed by hand)"} index={i} count={draft.experience.length} onMove={(dir) => patch((d) => ({ ...d, experience: move(d.experience, i, dir) }))} onRemove={() => patch((d) => ({ ...d, experience: remove(d.experience, i) }))}>
              <TextField id={`e-r-${i}`} label="Role" value={e.role} onChange={(v) => patch((d) => ({ ...d, experience: update(d.experience, i, { role: v }) }))} error={errors[`experience.${i}.role`]} />
              <TextField id={`e-c-${i}`} label="Company" value={e.company} onChange={(v) => patch((d) => ({ ...d, experience: update(d.experience, i, { company: v }) }))} error={errors[`experience.${i}.company`]} />
              <TextField id={`e-p-${i}`} label="Period" value={e.period} onChange={(v) => patch((d) => ({ ...d, experience: update(d.experience, i, { period: v }) }))} error={errors[`experience.${i}.period`]} />
              <TextField id={`e-b-${i}`} label="Bullets (one per line)" value={e.bulletsText} onChange={(v) => patch((d) => ({ ...d, experience: update(d.experience, i, { bulletsText: v }) }))} error={errors[`experience.${i}.bullets`]} multiline />
            </RowShell>
          ))}
          <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => patch((d) => ({ ...d, experience: [...d.experience, { role: "", company: "", period: "", bulletsText: "" }] }))}>
            Add role by hand
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Projects</h2>
          {draft.projects.map((p, i) => (
            <RowShell key={i} title="Project" index={i} count={draft.projects.length} onMove={(dir) => patch((d) => ({ ...d, projects: move(d.projects, i, dir) }))} onRemove={() => patch((d) => ({ ...d, projects: remove(d.projects, i) }))}>
              <TextField id={`p-t-${i}`} label="Title" value={p.title} onChange={(v) => patch((d) => ({ ...d, projects: update(d.projects, i, { title: v }) }))} error={errors[`projects.${i}.title`]} />
              <TextField id={`p-tech-${i}`} label="Technologies (comma separated)" value={p.technologiesText} onChange={(v) => patch((d) => ({ ...d, projects: update(d.projects, i, { technologiesText: v }) }))} />
              <TextField id={`p-l-${i}`} label="Live link" value={p.liveLink} onChange={(v) => patch((d) => ({ ...d, projects: update(d.projects, i, { liveLink: v }) }))} error={errors[`projects.${i}.liveLink`]} />
              <TextField id={`p-b-${i}`} label="Bullets (one per line)" value={p.bulletsText} onChange={(v) => patch((d) => ({ ...d, projects: update(d.projects, i, { bulletsText: v }) }))} error={errors[`projects.${i}.bullets`]} multiline />
            </RowShell>
          ))}
          <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => patch((d) => ({ ...d, projects: [...d.projects, { title: "", technologiesText: "", liveLink: "", bulletsText: "" }] }))}>
            Add project by hand
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Education</h2>
          <p className="text-sm text-zinc-500">Not stored on your site, so it is entered here by hand and kept when you regenerate.</p>
          {draft.education.map((ed, i) => (
            <RowShell key={i} title="Entry" index={i} count={draft.education.length} onMove={(dir) => patch((d) => ({ ...d, education: move(d.education, i, dir) }))} onRemove={() => patch((d) => ({ ...d, education: remove(d.education, i) }))}>
              <TextField id={`ed-q-${i}`} label="Qualification" value={ed.qualification} onChange={(v) => patch((d) => ({ ...d, education: update(d.education, i, { qualification: v }) }))} error={errors[`education.${i}.qualification`]} />
              <TextField id={`ed-i-${i}`} label="Institution" value={ed.institution} onChange={(v) => patch((d) => ({ ...d, education: update(d.education, i, { institution: v }) }))} error={errors[`education.${i}.institution`]} />
              <TextField id={`ed-p-${i}`} label="Period" value={ed.period} onChange={(v) => patch((d) => ({ ...d, education: update(d.education, i, { period: v }) }))} error={errors[`education.${i}.period`]} />
            </RowShell>
          ))}
          <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => patch((d) => ({ ...d, education: [...d.education, { institution: "", qualification: "", period: "" }] }))}>
            Add education
          </button>
        </section>

        <div className="flex flex-col gap-3">
          <SaveBar pending={pending} state={state} />
          <div className="flex flex-wrap gap-2">
            <a href={`/dashboard/cv/${id}/pdf`} className={smallButtonClass}>
              Download PDF (last saved version)
            </a>
            <button type="button" onClick={() => window.print()} className={smallButtonClass}>
              Print this preview
            </button>
          </div>
        </div>
      </form>

      <div className="lg:sticky lg:top-24 lg:self-start print:static">
        <CvPreview content={content} />
      </div>
    </div>
  );
}
