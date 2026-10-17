import type { IconType } from "react-icons";
import { FaFacebook, FaGithub, FaLinkedin, FaReddit, FaXTwitter } from "react-icons/fa6";
import type { Social, SocialKey } from "@/content/profile";

const icons: Record<SocialKey, IconType> = {
  github: FaGithub,
  linkedin: FaLinkedin,
  x: FaXTwitter,
  reddit: FaReddit,
  facebook: FaFacebook,
};

type SocialLinksProps = {
  socials: Social[];
  className?: string;
};

export function SocialLinks({ socials, className = "" }: SocialLinksProps) {
  return (
    <ul className={`flex flex-wrap gap-3 ${className}`}>
      {socials.map(({ key, name, url }) => {
        const Icon = icons[key];
        return (
          <li key={key}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={name}
              className="flex size-11 items-center justify-center rounded-md border-2 border-ink text-2xl transition-colors duration-300 hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper md:size-12"
            >
              <Icon aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
