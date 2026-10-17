import { profile } from "@/content/profile";
import { Reveal } from "@/components/reveal";
import { SocialLinks } from "@/components/social-links";
import HeroIllustration from "@/components/illustrations/hero-illustration";

export function Hero() {
  return (
    <section id="home" className="mx-auto grid max-w-7xl items-center gap-8 overflow-hidden px-4 py-10 md:grid-cols-2 md:py-16 lg:min-h-[calc(100vh-5rem)] lg:px-8">
      <div className="order-2 flex flex-col gap-5 md:order-1">
        <Reveal variant="slide-left">
          <h1 className="text-3xl leading-tight md:text-4xl lg:text-5xl">
            Hello I&apos;m{" "}
            <b className="font-extrabold">
              {profile.firstName}.
              <br />
              {profile.title} <span className="text-outline">{profile.subtitle}</span>
            </b>
            <br />
            Based in <b className="font-extrabold">{profile.location}</b>
          </h1>
        </Reveal>
        <Reveal variant="slide-left" delay={150}>
          <p className="max-w-xl text-sm text-zinc-500 md:text-base">{profile.description}</p>
        </Reveal>
        <Reveal variant="slide-left" delay={300}>
          <SocialLinks socials={profile.socials} />
        </Reveal>
      </div>
      <Reveal variant="slide-right" className="order-1 md:order-2">
        <HeroIllustration
          primaryColor="white"
          secondaryColor="black"
          strokeColor="black"
          width="100%"
          height="auto"
          lineWidth={800}
          aria-hidden="true"
          className="mx-auto h-auto w-full max-w-md md:max-w-none"
        />
      </Reveal>
    </section>
  );
}
