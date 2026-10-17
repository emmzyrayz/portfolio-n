import { aboutParagraphs } from "@/content/profile";
import { Reveal } from "@/components/reveal";
import { ProfileIllustration } from "@/components/illustrations/profile-illustration";

export function About() {
  return (
    <section id="about" className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:gap-10 lg:px-8">
      <Reveal variant="slide-left">
        <ProfileIllustration width="100%" height="auto" aria-hidden="true" className="mx-auto h-auto w-full max-w-md" />
      </Reveal>
      <Reveal variant="slide-right">
        <div className="flex flex-col gap-5">
          <h2 className="text-center text-3xl md:text-left lg:text-5xl">
            About <span className="font-extrabold">Me</span>
          </h2>
          <div className="flex flex-col gap-3 text-sm md:text-lg">
            {aboutParagraphs.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
