"use client";

import { useActionState } from "react";
import { saveProjectsAction, type ContentState } from "@/app/actions/content";
import type { EditableProject } from "@/lib/content-admin";
import { RowShell, SaveBar, TextField, smallButtonClass, useList } from "./editor-ui";

const initialState: ContentState = { status: "idle" };

type Row = {
  title: string;
  description: string;
  technologies: string; // comma separated while editing
  imageUrl: string;
  githubLink: string;
  liveLink: string;
};

export function ProjectsEditor({ initial }: { initial: EditableProject[] }) {
  const [state, action, pending] = useActionState(saveProjectsAction, initialState);
  const errors = state.fieldErrors ?? {};
  const list = useList<Row>(
    initial.map((p) => ({
      title: p.title,
      description: p.description,
      technologies: p.technologies.join(", "),
      imageUrl: p.imageUrl ?? "",
      githubLink: p.githubLink ?? "",
      liveLink: p.liveLink ?? "",
    })),
  );

  const payload = JSON.stringify(
    list.rows.map((r) => ({
      ...r,
      technologies: r.technologies
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    })),
  );

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />
      {list.rows.map((row, i) => (
        <RowShell key={i} title="Project" index={i} count={list.rows.length} onMove={(d) => list.move(i, d)} onRemove={() => list.remove(i)}>
          <TextField id={`pr-title-${i}`} label="Title" value={row.title} onChange={(v) => list.update(i, { title: v })} error={errors[`${i}.title`]} />
          <TextField id={`pr-desc-${i}`} label="Description" value={row.description} onChange={(v) => list.update(i, { description: v })} error={errors[`${i}.description`]} multiline />
          <TextField
            id={`pr-tech-${i}`}
            label="Technologies (comma separated)"
            value={row.technologies}
            onChange={(v) => list.update(i, { technologies: v })}
            error={Object.entries(errors).find(([k]) => k.startsWith(`${i}.technologies`))?.[1]}
          />
          <TextField id={`pr-image-${i}`} label="Image URL (https://... or /images/...)" value={row.imageUrl} onChange={(v) => list.update(i, { imageUrl: v })} error={errors[`${i}.imageUrl`]} />
          <TextField id={`pr-gh-${i}`} label="GitHub link" value={row.githubLink} onChange={(v) => list.update(i, { githubLink: v })} error={errors[`${i}.githubLink`]} />
          <TextField id={`pr-live-${i}`} label="Live link" value={row.liveLink} onChange={(v) => list.update(i, { liveLink: v })} error={errors[`${i}.liveLink`]} />
        </RowShell>
      ))}
      {errors[""] && <p className="text-sm text-error">{errors[""]}</p>}
      <button
        type="button"
        className={`${smallButtonClass} w-fit`}
        onClick={() => list.add({ title: "", description: "", technologies: "", imageUrl: "", githubLink: "", liveLink: "" })}
      >
        Add project
      </button>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}
