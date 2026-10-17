import { getProfile } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { SocialLinks } from "@/components/social-links";
import { ContactForm } from "@/components/contact-form";

export async function Contact() {
  const profile = await getProfile();
  return (
    <section id="contact" className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 md:grid-cols-2 lg:px-8">
      <Reveal variant="slide-left" className="flex justify-center md:justify-start">
        <ContactForm />
      </Reveal>
      <Reveal variant="slide-right">
        <div className="flex flex-col gap-4 text-center md:text-left">
          <h2 className="text-3xl leading-tight font-bold md:text-4xl lg:text-6xl">
            Let&apos;s <span className="text-outline">talk</span> for <br />
            something special
          </h2>
          <p className="opacity-60 md:text-lg">
            I seek to push the limits of creativity to create high-engaging, user-friendly, and memorable interactive
            experiences.
          </p>
          <a href={`mailto:${profile.email}`} className="text-lg font-bold underline-offset-4 hover:underline">
            {profile.email}
          </a>
          <SocialLinks socials={profile.socials} className="justify-center md:justify-start" />
        </div>
      </Reveal>
    </section>
  );
}
