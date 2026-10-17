import type { CSSProperties } from "react";
import { getSkills } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { skillIcons } from "@/components/skill-icons";

export async function Skills() {
  const skills = await getSkills();
  return (
    <section id="skills" className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <Reveal>
        <SectionHeading light="My" bold="SKILLS" />
      </Reveal>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-5">
        {skills.map((skill, i) => {
          const Icon = skillIcons[skill.icon];
          return (
            <li key={skill.name}>
              <Reveal delay={(i % 5) * 80}>
                <div
                  tabIndex={0}
                  style={{ "--level": `${skill.proficiency}%` } as CSSProperties}
                  className="group relative flex h-44 flex-col items-center justify-center overflow-hidden rounded-lg bg-zinc-100 shadow-md md:h-48"
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0 bg-zinc-300 transition-all duration-500 ease-in-out group-hover:h-(--level) group-focus-visible:h-(--level)"
                  />
                  <Icon aria-hidden="true" className="relative mb-2 text-4xl text-zinc-700 transition-transform group-hover:scale-110" />
                  <p className="relative text-sm font-medium text-zinc-800">{skill.name}</p>
                  <span className="absolute bottom-2 text-xs font-bold text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {skill.proficiency}%
                  </span>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
