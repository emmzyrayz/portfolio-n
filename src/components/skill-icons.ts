import type { IconType } from "react-icons";
import { FaGitAlt, FaGithub, FaJs, FaNodeJs, FaReact, FaSass } from "react-icons/fa";
import { RiNextjsFill, RiTailwindCssFill } from "react-icons/ri";
import { SiMongodb, SiNestjs } from "react-icons/si";
import type { SkillIcon } from "@/content/skills";

export const skillIcons: Record<SkillIcon, IconType> = {
  git: FaGitAlt,
  javascript: FaJs,
  sass: FaSass,
  nestjs: SiNestjs,
  tailwind: RiTailwindCssFill,
  nextjs: RiNextjsFill,
  github: FaGithub,
  react: FaReact,
  nodejs: FaNodeJs,
  mongodb: SiMongodb,
};
