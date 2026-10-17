export type SocialKey = "github" | "linkedin" | "x" | "reddit" | "facebook";

export type Social = { key: SocialKey; name: string; url: string };

export const profile = {
  fullName: "Nnamdi Emmanuel Dike",
  firstName: "Emmanuel",
  title: "Frontend",
  subtitle: "Developer",
  location: "Nigeria",
  summary:
    "Frontend web developer building dynamic, user-focused websites and applications with React, Next.js and Tailwind CSS.",
  description:
    "A skilled web developer specializing in building dynamic, user-focused websites and applications with expertise in modern technologies like React, Next.js, and Tailwind CSS. Passionate about innovation and problem-solving, I strive to deliver efficient and scalable digital solutions.",
  // PLACEHOLDER: replace with your real contact email.
  email: "hello@example.com",
  // Set to e.g. "/resume.pdf" once the file is in /public. The button is hidden while undefined.
  resumeUrl: undefined as string | undefined,
  socials: [
    { key: "github", name: "GitHub", url: "https://github.com/emmzyrayz" },
    { key: "linkedin", name: "LinkedIn", url: "https://www.linkedin.com/in/nnamdi-dike-604522281" },
    { key: "x", name: "X (Twitter)", url: "https://www.x.com/okayinterrupt" },
    { key: "reddit", name: "Reddit", url: "https://www.reddit.com/u/okeyinterrupt" },
    { key: "facebook", name: "Facebook", url: "https://www.facebook.com/Nnamdidike0029" },
  ] satisfies Social[],
};

export const navLinks = [
  { label: "About", href: "#about" },
  { label: "Skills", href: "#skills" },
  { label: "Projects", href: "#projects" },
  { label: "Contact", href: "#contact" },
];

// PLACEHOLDER: replace with your real bio.
export const aboutParagraphs = [
  "PLACEHOLDER - Write a short introduction about who you are, what you build and what drives you.",
  "PLACEHOLDER - Describe your background, how you got into development and the kind of problems you enjoy solving.",
  "PLACEHOLDER - Mention what you are currently learning or looking for, and what you do outside of code.",
];
