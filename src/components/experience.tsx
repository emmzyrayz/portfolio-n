import { getExperience } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export async function Experience() {
  const experience = await getExperience();
  return (
    <section id="experience" className="mt-9 bg-ink px-4 py-12 text-paper md:py-16 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <SectionHeading light="My" bold="Experience" />
        </Reveal>
        <ol className="flex flex-col gap-4">
          {experience.map((item, i) => (
            <li key={`${item.company}-${i}`}>
              <Reveal delay={i * 100}>
                <article className="rounded-lg bg-zinc-400/20 p-4 shadow-md transition-colors duration-500 hover:bg-zinc-500/40 md:p-5">
                  <div className="flex flex-col justify-between gap-1 md:flex-row md:items-baseline">
                    <h3 className="text-base font-semibold md:text-xl">
                      {item.role} <span className="font-normal text-zinc-300">at {item.company}</span>
                    </h3>
                    <p className="text-xs text-zinc-300 md:text-sm">{item.period}</p>
                  </div>
                  <p className="mt-3 text-sm font-light text-zinc-200 md:text-base">{item.description}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
