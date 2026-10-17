import Image from "next/image";
import { FaExternalLinkAlt, FaGithub } from "react-icons/fa";
import type { Project } from "@/content/projects";

type ProjectCardProps = { project: Project; reversed: boolean };

export function ProjectCard({ project, reversed }: ProjectCardProps) {
  const { title, description, technologies, image, githubLink, liveLink } = project;

  return (
    <article className={`flex flex-col items-center gap-6 md:gap-10 ${reversed ? "md:flex-row-reverse" : "md:flex-row"}`}>
      <div className="relative aspect-3/2 w-full overflow-hidden rounded-lg shadow-2xl md:w-1/2">
        {image ? (
          <Image
            src={image}
            alt={`${title} preview`}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div aria-hidden="true" className="flex size-full items-center justify-center bg-linear-to-br from-zinc-200 to-zinc-400 text-6xl font-extrabold text-paper">
            {title.charAt(0)}
          </div>
        )}
      </div>

      <div className={`w-full space-y-4 text-center md:w-1/2 ${reversed ? "md:text-right" : "md:text-left"}`}>
        <h3 className="text-2xl font-bold text-zinc-800">{title}</h3>
        <p className="rounded-lg bg-zinc-100 p-5 text-zinc-600 shadow-md">{description}</p>
        {technologies.length > 0 && (
          <ul className={`flex flex-wrap justify-center gap-2 ${reversed ? "md:justify-end" : "md:justify-start"}`}>
            {technologies.map((tech) => (
              <li key={tech} className="rounded-full bg-ink px-3 py-1 text-sm text-paper">
                {tech}
              </li>
            ))}
          </ul>
        )}
        <div className={`flex justify-center gap-4 ${reversed ? "md:justify-end" : "md:justify-start"}`}>
          {githubLink && (
            <a href={githubLink} target="_blank" rel="noopener noreferrer" aria-label={`${title} on GitHub`} className="text-zinc-700 transition-colors hover:text-ink">
              <FaGithub size={24} aria-hidden="true" />
            </a>
          )}
          {liveLink && (
            <a href={liveLink} target="_blank" rel="noopener noreferrer" aria-label={`${title} live site`} className="text-zinc-700 transition-colors hover:text-ink">
              <FaExternalLinkAlt size={22} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
