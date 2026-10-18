import type { CvContent, CvModelOutput, CvSource } from "@/lib/cv-schemas";

/**
 * Grounding: keeps a generated CV tied to the owner's real data. Pure functions (no I/O) so the
 * server uses them to merge model output and the editor reuses `computeFlags` for live highlights.
 */

export type CvFlag = {
  /** Where the text lives, e.g. "summary", "experience.0.bullets.2", "skills.1.items.3". */
  path: string;
  text: string;
  /** Terms or numbers that were not found in the owner's data. */
  unknown: string[];
};

const MAX_BULLETS = 6;
const MAX_PROJECTS = 4;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/* ---------- Source corpus ---------- */

function sourceStrings(source: CvSource): string[] {
  const { profile } = source;
  return [
    profile.fullName,
    profile.title,
    profile.location,
    profile.summary,
    profile.description,
    ...profile.socials.map((s) => s.name),
    ...source.about,
    ...source.skills,
    ...source.experience.flatMap((e) => [e.role, e.company, e.period, e.description]),
    ...source.projects.flatMap((p) => [p.title, p.description, ...p.technologies]),
  ];
}

const WORD = /[a-z0-9][a-z0-9.+#-]*/g;

function buildCorpus(source: CvSource) {
  const text = sourceStrings(source).join(" \n ").toLowerCase();
  const words = new Set<string>(text.match(WORD) ?? []);
  return { text, words };
}

const stripEdge = (t: string) => t.replace(/^[("'[]+|[.,;:!?)"'\]]+$/g, "");

function wordKnown(word: string, words: Set<string>) {
  const w = word.toLowerCase();
  if (words.has(w)) return true;
  if (w.endsWith("s") && words.has(w.slice(0, -1))) return true;
  if (words.has(`${w}s`)) return true;
  // hyphenated / dotted compounds are known when every part is
  const parts = w.split(/[-/]/).filter(Boolean);
  return parts.length > 1 && parts.every((p) => words.has(p));
}

/** Numbers that do not appear in the source (percentages, counts, years...). */
function unknownNumbers(text: string, corpusText: string) {
  const found = text.match(/\d[\d,.]*%?/g) ?? [];
  return found
    .map((n) => n.replace(/[.,]+$/, ""))
    .filter((n) => {
      const digits = n.replace(/,/g, "");
      const escaped = digits.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return !new RegExp(`(?<![\\d.])${escaped}(?![\\d])`).test(corpusText.replace(/,/g, ""));
    });
}

/** Capitalised / tech-looking terms (not sentence starters) that the source never mentions. */
function unknownTerms(text: string, words: Set<string>) {
  const unknown: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const tokens = sentence.split(/\s+/).filter(Boolean);
    tokens.forEach((raw, i) => {
      if (i === 0) return; // sentence starters are capitalised anyway
      const token = stripEdge(raw);
      if (token.length < 2 || /^\d/.test(token)) return;
      const looksLikeName = /^[A-Z]/.test(token) || /[A-Z].*[A-Z]/.test(token) || /[.+#]/.test(token);
      if (looksLikeName && !wordKnown(token, words)) unknown.push(token);
    });
  }
  return [...new Set(unknown)];
}

function flagText(path: string, text: string, corpus: ReturnType<typeof buildCorpus>): CvFlag | null {
  const unknown = [...unknownNumbers(text, corpus.text), ...unknownTerms(text, corpus.words)];
  return unknown.length > 0 ? { path, text, unknown: [...new Set(unknown)] } : null;
}

/** Highlights anything in the generated text that the owner's data does not support. */
export function computeFlags(content: CvContent, source: CvSource): CvFlag[] {
  const corpus = buildCorpus(source);
  const flags: CvFlag[] = [];
  const add = (path: string, text: string) => {
    if (!text.trim()) return;
    const flag = flagText(path, text, corpus);
    if (flag) flags.push(flag);
  };

  add("headline", content.headline);
  add("summary", content.summary);
  content.experience.forEach((e, i) => e.bullets.forEach((b, j) => add(`experience.${i}.bullets.${j}`, b)));
  content.projects.forEach((p, i) => p.bullets.forEach((b, j) => add(`projects.${i}.bullets.${j}`, b)));

  const allowedSkills = allowedSkillSet(source);
  content.skills.forEach((g, i) =>
    g.items.forEach((item, j) => {
      if (!allowedSkills.has(item.toLowerCase())) flags.push({ path: `skills.${i}.items.${j}`, text: item, unknown: [item] });
    }),
  );
  return flags;
}

/* ---------- Skills ---------- */

function allowedSkillSet(source: CvSource) {
  return new Set([...source.skills, ...source.projects.flatMap((p) => p.technologies)].map((s) => s.toLowerCase()));
}

function canonicalSkills(source: CvSource) {
  const map = new Map<string, string>();
  for (const s of [...source.skills, ...source.projects.flatMap((p) => p.technologies)]) {
    if (!map.has(s.toLowerCase())) map.set(s.toLowerCase(), s);
  }
  return map;
}

/* ---------- Merge ---------- */

export type MergeResult = { content: CvContent; dropped: string[]; notes: string[] };

const cleanBullets = (bullets: string[], max: number) =>
  bullets
    .map(clean)
    .filter(Boolean)
    .slice(0, max)
    .map((b) => b.slice(0, 400));

/**
 * Builds the CV from the model's wording plus the owner's facts. The model never decides roles,
 * companies, periods, titles, links or contact details: those are copied from the source here, so
 * nothing in the job description (or a hallucination) can add an employer or a date.
 */
export function mergeModelOutput(source: CvSource, output: CvModelOutput): MergeResult {
  const dropped: string[] = [];
  const notes: string[] = [];
  const { profile } = source;

  const expById = new Map(source.experience.map((e) => [e.id, e]));
  const seenExp = new Set<string>();
  const experience: CvContent["experience"] = [];
  for (const entry of output.experience) {
    const src = expById.get(entry.sourceId);
    if (!src || seenExp.has(src.id)) {
      if (!src) dropped.push(`unknown experience id "${entry.sourceId}"`);
      continue;
    }
    seenExp.add(src.id);
    experience.push({
      sourceId: src.id,
      role: src.role,
      company: src.company,
      period: src.period,
      bullets: cleanBullets(entry.bullets, MAX_BULLETS),
    });
  }
  // Never silently drop a role the owner actually had: keep omitted ones with their own description.
  for (const src of source.experience) {
    if (seenExp.has(src.id)) continue;
    notes.push(`"${src.role}" was left out by the model, so it was added back with your original description.`);
    experience.push({
      sourceId: src.id,
      role: src.role,
      company: src.company,
      period: src.period,
      bullets: cleanBullets([src.description], 1),
    });
  }

  const projById = new Map(source.projects.map((p) => [p.id, p]));
  const seenProj = new Set<string>();
  const projects: CvContent["projects"] = [];
  for (const entry of output.projects) {
    const src = projById.get(entry.sourceId);
    if (!src || seenProj.has(src.id) || projects.length >= MAX_PROJECTS) continue;
    seenProj.add(src.id);
    projects.push({
      sourceId: src.id,
      title: src.title,
      technologies: src.technologies.slice(0, 10),
      liveLink: src.liveLink,
      bullets: cleanBullets(entry.bullets, 3),
    });
  }

  const canonical = canonicalSkills(source);
  const skills: CvContent["skills"] = [];
  const usedSkills = new Set<string>();
  for (const group of output.skills) {
    const items: string[] = [];
    for (const raw of group.items) {
      const canon = canonical.get(clean(raw).toLowerCase());
      if (!canon) {
        dropped.push(`skill "${clean(raw)}" is not in your data`);
        continue;
      }
      if (!usedSkills.has(canon.toLowerCase())) {
        usedSkills.add(canon.toLowerCase());
        items.push(canon);
      }
    }
    if (items.length > 0 && skills.length < 8) skills.push({ group: clean(group.group).slice(0, 60) || "Skills", items });
  }

  const content: CvContent = {
    header: {
      fullName: profile.fullName,
      title: profile.title,
      email: profile.email,
      location: profile.location,
      links: profile.socials.slice(0, 6).map((s) => ({ label: s.name, url: s.url })),
    },
    headline: clean(output.headline).slice(0, 140),
    summary: clean(output.summary).slice(0, 1500),
    skills,
    experience,
    projects,
    education: [],
  };
  return { content, dropped, notes };
}
