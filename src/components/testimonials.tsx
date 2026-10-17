import Image from "next/image";
import { FaQuoteRight } from "react-icons/fa";
import { testimonials } from "@/content/testimonials";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function Testimonials() {
  return (
    <section id="testimonials" className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <Reveal>
        <SectionHeading light="My" bold="Testimonials" />
      </Reveal>
      <ul className="flex flex-wrap justify-center gap-4">
        {testimonials.map((t, i) => (
          <li key={`${t.name}-${i}`} className="w-full sm:w-80">
            <Reveal delay={i * 100} className="h-full">
              <figure className="group flex h-full flex-col items-center gap-4 rounded-lg p-5 text-center shadow-lg transition-all duration-500 ease-in-out hover:scale-105 hover:bg-ink hover:text-paper hover:shadow-xl">
                <div className="relative">
                  <Image src={t.image} alt={`Portrait of ${t.name}`} width={100} height={100} className="rounded-full" />
                  <span className="absolute right-0.5 bottom-0.5 flex rounded-full bg-ink p-2 text-paper group-hover:bg-paper group-hover:text-ink">
                    <FaQuoteRight aria-hidden="true" />
                  </span>
                </div>
                <blockquote>
                  <p>{t.quote}</p>
                </blockquote>
                <hr className="h-0.75 w-1/2 rounded-full border-0 bg-ink group-hover:bg-paper" />
                <figcaption>
                  <p className="text-xl font-semibold">{t.name}</p>
                  <p className="text-lg font-medium opacity-60">{t.role}</p>
                </figcaption>
              </figure>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
