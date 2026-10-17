"use client";

import { useActionState, useState } from "react";
import { saveProfileAction, type ContentState } from "@/app/actions/content";
import type { SocialKey } from "@/content/profile";
import type { SiteProfile } from "@/lib/content";
import { SOCIAL_KEYS } from "@/lib/content-schemas";
import { Field, RowShell, SaveBar, TextField, fieldClass, smallButtonClass, useList } from "./editor-ui";

const initialState: ContentState = { status: "idle" };

export function ProfileEditor({ initial }: { initial: SiteProfile }) {
  const [state, action, pending] = useActionState(saveProfileAction, initialState);
  const errors = state.fieldErrors ?? {};

  const [form, setForm] = useState({
    firstName: initial.firstName,
    fullName: initial.fullName,
    title: initial.title,
    subtitle: initial.subtitle,
    location: initial.location,
    summary: initial.summary,
    description: initial.description,
    email: initial.email,
    resumeUrl: initial.resumeUrl ?? "",
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const socials = useList(initial.socials.map((s) => ({ ...s })));
  const paragraphs = useList(initial.aboutParagraphs.map((text) => ({ text })));

  const payload = JSON.stringify({
    ...form,
    socials: socials.rows,
    aboutParagraphs: paragraphs.rows.map((p) => p.text),
  });

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="payload" value={payload} />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Hero</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="p-first" label="First name (greeting)" value={form.firstName} onChange={set("firstName")} error={errors.firstName} />
          <TextField id="p-full" label="Full name (navbar, footer)" value={form.fullName} onChange={set("fullName")} error={errors.fullName} />
          <TextField id="p-title" label="Title" value={form.title} onChange={set("title")} error={errors.title} />
          <TextField id="p-subtitle" label="Subtitle (outlined)" value={form.subtitle} onChange={set("subtitle")} error={errors.subtitle} />
        </div>
        <TextField id="p-location" label="Location" value={form.location} onChange={set("location")} error={errors.location} />
        <TextField id="p-summary" label="Summary (page description, SEO)" value={form.summary} onChange={set("summary")} error={errors.summary} multiline />
        <TextField id="p-description" label="Hero description" value={form.description} onChange={set("description")} error={errors.description} multiline />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Contact</h2>
        <TextField id="p-email" label="Public email" type="email" value={form.email} onChange={set("email")} error={errors.email} />
        <TextField
          id="p-resume"
          label="Resume URL (https://... or /resume.pdf; empty hides the button)"
          value={form.resumeUrl}
          onChange={set("resumeUrl")}
          error={errors.resumeUrl}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Social links</h2>
        {socials.rows.map((social, i) => (
          <RowShell key={i} title="Link" index={i} count={socials.rows.length} onMove={(d) => socials.move(i, d)} onRemove={() => socials.remove(i)}>
            <Field id={`s-key-${i}`} label="Network" error={errors[`socials.${i}.key`]}>
              <select
                id={`s-key-${i}`}
                value={social.key}
                onChange={(e) => socials.update(i, { key: e.target.value as SocialKey })}
                className={fieldClass}
              >
                {SOCIAL_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </Field>
            <TextField id={`s-name-${i}`} label="Label" value={social.name} onChange={(v) => socials.update(i, { name: v })} error={errors[`socials.${i}.name`]} />
            <TextField id={`s-url-${i}`} label="URL" value={social.url} onChange={(v) => socials.update(i, { url: v })} error={errors[`socials.${i}.url`]} />
          </RowShell>
        ))}
        {errors.socials && <p className="text-sm text-error">{errors.socials}</p>}
        <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => socials.add({ key: "github", name: "", url: "" })}>
          Add social link
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">About paragraphs</h2>
        {paragraphs.rows.map((paragraph, i) => (
          <RowShell key={i} title="Paragraph" index={i} count={paragraphs.rows.length} onMove={(d) => paragraphs.move(i, d)} onRemove={() => paragraphs.remove(i)}>
            <TextField id={`a-${i}`} label="Text" value={paragraph.text} onChange={(v) => paragraphs.update(i, { text: v })} error={errors[`aboutParagraphs.${i}`]} multiline />
          </RowShell>
        ))}
        {errors.aboutParagraphs && <p className="text-sm text-error">{errors.aboutParagraphs}</p>}
        <button type="button" className={`${smallButtonClass} w-fit`} onClick={() => paragraphs.add({ text: "" })}>
          Add paragraph
        </button>
      </section>

      <SaveBar pending={pending} state={state} />
    </form>
  );
}
