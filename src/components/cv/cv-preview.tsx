import type { CvContent } from "@/lib/cv-schemas";

/** Unsaved text can be anything while typing, so only http(s) URLs become links. */
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

/** On-screen A4-style CV. Also the print layout: everything else on the page is `print:hidden`. */
export function CvPreview({ content }: { content: CvContent }) {
  const { header } = content;
  const sectionTitle = "mb-1.5 border-b border-ink pb-0.5 text-[11px] font-bold tracking-widest uppercase";

  return (
    <article
      id="cv-preview"
      aria-label="CV preview"
      className="mx-auto w-full max-w-[794px] bg-paper p-6 text-[12px] leading-snug text-ink shadow-lg ring-1 ring-zinc-200 sm:p-10 print:max-w-none print:p-0 print:shadow-none print:ring-0"
    >
      <header>
        <h2 className="text-2xl font-bold">{header.fullName}</h2>
        {header.title && <p className="mt-0.5 text-sm text-zinc-700">{header.title}</p>}
        <p className="mt-1 flex flex-wrap gap-x-3 text-zinc-700">
          {[header.email, header.location].filter(Boolean).map((c) => (
            <span key={c}>{c}</span>
          ))}
          {header.links.map((l) => (
            <a key={l.url} href={safeHref(l.url)} className="underline" target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </p>
      </header>

      {content.headline && <p className="mt-3 text-[13px] font-bold">{content.headline}</p>}

      {content.summary && (
        <section className="mt-3">
          <h3 className={sectionTitle}>Summary</h3>
          <p>{content.summary}</p>
        </section>
      )}

      {content.skills.length > 0 && (
        <section className="mt-3">
          <h3 className={sectionTitle}>Skills</h3>
          {content.skills.map((g, i) => (
            <p key={i}>
              <b>{g.group}: </b>
              {g.items.join(", ")}
            </p>
          ))}
        </section>
      )}

      {content.experience.length > 0 && (
        <section className="mt-3">
          <h3 className={sectionTitle}>Experience</h3>
          {content.experience.map((e, i) => (
            <div key={i} className="mb-2 break-inside-avoid">
              <div className="flex justify-between gap-3">
                <p className="font-bold">
                  {e.role} <span className="font-normal text-zinc-700">- {e.company}</span>
                </p>
                <p className="shrink-0 text-zinc-700">{e.period}</p>
              </div>
              <ul className="list-disc pl-5">
                {e.bullets.filter((b) => b.trim()).map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.projects.length > 0 && (
        <section className="mt-3">
          <h3 className={sectionTitle}>Projects</h3>
          {content.projects.map((p, i) => (
            <div key={i} className="mb-2 break-inside-avoid">
              <div className="flex justify-between gap-3">
                <p className="font-bold">{p.title}</p>
                {p.liveLink && (
                  <a href={safeHref(p.liveLink)} className="shrink-0 text-zinc-700 underline" target="_blank" rel="noopener noreferrer">
                    {p.liveLink.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              {p.technologies.length > 0 && <p className="text-zinc-700">{p.technologies.join(", ")}</p>}
              <ul className="list-disc pl-5">
                {p.bullets.filter((b) => b.trim()).map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.education.length > 0 && (
        <section className="mt-3">
          <h3 className={sectionTitle}>Education</h3>
          {content.education.map((ed, i) => (
            <div key={i} className="flex justify-between gap-3">
              <p>
                <b>{ed.qualification}</b> <span className="text-zinc-700">- {ed.institution}</span>
              </p>
              <p className="shrink-0 text-zinc-700">{ed.period}</p>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
