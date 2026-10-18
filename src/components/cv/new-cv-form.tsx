"use client";

import { useActionState, useState } from "react";
import { generateCvAction, type CvState } from "@/app/actions/cv";
import { Field, TextField, buttonClass, fieldClass } from "@/components/dashboard/editor-ui";

const initialState: CvState = { status: "idle" };
const MAX_JD = 8000;

export function NewCvForm() {
  const [state, action, pending] = useActionState(generateCvAction, initialState);
  const errors = state.fieldErrors ?? {};

  // Controlled so what you typed survives a failed attempt (React resets uncontrolled forms after an action).
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [length, setLength] = useState("one-page");

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Named name="jobTitle" value={jobTitle}>
          <TextField id="cv-job-title" label="Job title" value={jobTitle} onChange={setJobTitle} error={errors.jobTitle} />
        </Named>
        <Named name="company" value={company}>
          <TextField id="cv-company" label="Company (optional)" value={company} onChange={setCompany} error={errors.company} />
        </Named>
      </div>

      <Named name="jobDescription" value={jobDescription}>
        <div>
          <TextField
            id="cv-jd"
            label="Job description (paste the full posting)"
            value={jobDescription}
            onChange={setJobDescription}
            error={errors.jobDescription}
            multiline
          />
          <p className={`mt-1 text-xs ${jobDescription.length > MAX_JD ? "text-error" : "text-zinc-500"}`}>
            {jobDescription.length} / {MAX_JD} characters. Used only to decide what to emphasise, never as facts about you.
          </p>
        </div>
      </Named>

      <Field id="cv-length" label="Length">
        <select id="cv-length" name="length" value={length} onChange={(e) => setLength(e.target.value)} className={fieldClass}>
          <option value="one-page">One page (concise)</option>
          <option value="two-page">Two pages (detailed)</option>
        </select>
      </Field>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Generating... this can take up to a minute" : "Generate CV"}
      </button>
      <p role="status" aria-live="polite" className={state.status === "error" ? "text-error" : "text-zinc-600"}>
        {state.message}
      </p>
    </form>
  );
}

/** Adds the form field name that TextField (controlled, nameless) does not render itself. */
function Named({ name, value, children }: { name: string; value: string; children: React.ReactNode }) {
  return (
    <>
      <input type="hidden" name={name} value={value} />
      {children}
    </>
  );
}
