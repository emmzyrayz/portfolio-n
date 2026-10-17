export type SkillIcon =
  | "git"
  | "javascript"
  | "sass"
  | "nestjs"
  | "tailwind"
  | "nextjs"
  | "github"
  | "react"
  | "nodejs"
  | "mongodb";

export type Skill = { name: string; icon: SkillIcon; proficiency: number };

// PLACEHOLDER proficiencies carried over from the old site; adjust as you see fit.
export const skills: Skill[] = [
  { name: "Git", icon: "git", proficiency: 85 },
  { name: "JavaScript", icon: "javascript", proficiency: 90 },
  { name: "Sass/SCSS", icon: "sass", proficiency: 75 },
  { name: "NestJS", icon: "nestjs", proficiency: 70 },
  { name: "Tailwind CSS", icon: "tailwind", proficiency: 80 },
  { name: "Next.js", icon: "nextjs", proficiency: 75 },
  { name: "GitHub", icon: "github", proficiency: 85 },
  { name: "React", icon: "react", proficiency: 90 },
  { name: "Node.js", icon: "nodejs", proficiency: 80 },
  { name: "MongoDB", icon: "mongodb", proficiency: 70 },
];
