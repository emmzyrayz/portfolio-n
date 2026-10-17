import { Hero } from "@/components/hero";
import { Skills } from "@/components/skills";
import { Experience } from "@/components/experience";
import { About } from "@/components/about";
import { Projects } from "@/components/projects";
import { Testimonials } from "@/components/testimonials";
import { Contact } from "@/components/contact";

export default function Home() {
  return (
    <>
      <Hero />
      <Skills />
      <Experience />
      <About />
      <Projects />
      <Testimonials />
      <Contact />
    </>
  );
}
