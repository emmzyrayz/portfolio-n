"use client";

import { useActionState } from "react";
import { saveExperienceAction, type ContentState } from "@/app/actions/content";
import type { Experience } from "@/content/experience";
import { RowShell, SaveBar, TextField, smallButtonClass, useList } from "./editor-ui";

const initialState: ContentState = { status: "idle" };

export function ExperienceEditor({ initial }: { initial: Experience[] }) {
  const [state, action, pending] = useActionState(saveExperienceAction, initialState);
  const errors = state.fieldErrors ?? {};
  const list = useList<Experience>(initial.map((e) => ({ ...e })));

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="payload" value={JSON.stringify(list.rows)} />
      {list.rows.map((row, i) => (
        <RowShell key={i} title="Role" index={i} count={list.rows.length} onMove={(d) => list.move(i, d)} onRemove={() => list.remove(i)}>
          <TextField id={`ex-role-${i}`} label="Role" value={row.role} onChange={(v) => list.update(i, { role: v })} error={errors[`${i}.role`]} />
          <TextField id={`ex-company-${i}`} label="Company" value={row.company} onChange={(v) => list.update(i, { company: v })} error={errors[`${i}.company`]} />
          <TextField id={`ex-period-${i}`} label="Period (e.g. Jan 2023 - Present)" value={row.period} onChange={(v) => list.update(i, { period: v })} error={errors[`${i}.period`]} />
          <TextField id={`ex-desc-${i}`} label="Description" value={row.description} onChange={(v) => list.update(i, { description: v })} error={errors[`${i}.description`]} multiline />
        </RowShell>
      ))}
      {errors[""] && <p className="text-sm text-error">{errors[""]}</p>}
      <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => list.add({ role: "", company: "", period: "", description: "" })}>
        Add role
      </button>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}
