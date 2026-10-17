"use client";

import { useActionState } from "react";
import { saveSkillsAction, type ContentState } from "@/app/actions/content";
import type { Skill } from "@/content/skills";
import { SKILL_ICONS } from "@/lib/content-schemas";
import { Field, RowShell, SaveBar, TextField, fieldClass, smallButtonClass, useList } from "./editor-ui";

const initialState: ContentState = { status: "idle" };

type Row = { name: string; icon: string; proficiency: string };

export function SkillsEditor({ initial }: { initial: Skill[] }) {
  const [state, action, pending] = useActionState(saveSkillsAction, initialState);
  const errors = state.fieldErrors ?? {};
  const list = useList<Row>(initial.map((s) => ({ name: s.name, icon: s.icon, proficiency: String(s.proficiency) })));

  const payload = JSON.stringify(list.rows);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />
      {list.rows.map((row, i) => (
        <RowShell key={i} title="Skill" index={i} count={list.rows.length} onMove={(d) => list.move(i, d)} onRemove={() => list.remove(i)}>
          <TextField id={`sk-name-${i}`} label="Name" value={row.name} onChange={(v) => list.update(i, { name: v })} error={errors[`${i}.name`]} />
          <Field id={`sk-icon-${i}`} label="Icon" error={errors[`${i}.icon`]}>
            <select id={`sk-icon-${i}`} value={row.icon} onChange={(e) => list.update(i, { icon: e.target.value })} className={fieldClass}>
              {SKILL_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
          </Field>
          <TextField id={`sk-level-${i}`} label="Proficiency (0-100)" type="number" value={row.proficiency} onChange={(v) => list.update(i, { proficiency: v })} error={errors[`${i}.proficiency`]} />
        </RowShell>
      ))}
      {errors[""] && <p className="text-sm text-error">{errors[""]}</p>}
      <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => list.add({ name: "", icon: SKILL_ICONS[0], proficiency: "50" })}>
        Add skill
      </button>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}
