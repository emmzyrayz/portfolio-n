export type SocialKey = "github" | "linkedin" | "x" | "reddit" | "facebook";

export type Social = { key: SocialKey; name: string; url: string };

export const profile = {
  fullName: "Nnamdi Emmanuel Dike",
  firstName: "Emmanuel",
  title: "Fullstack",
  subtitle: "Developer",
  location: "Nigeria",
  summary:
    "Fullstack web developer building dynamic, user-focused websites and applications with React, Next.js and Tailwind CSS.",
  description:
    "A skilled web developer specializing in building dynamic, user-focused websites and applications with expertise in modern technologies like React, Next.js, TypeScript, and Node.js. Passionate about innovation, scalable digital solutions, and optimizing performance for all devices.",
  // Be sure to replace this with your actual working email address
  email: "hello@example.com",
  // Set to e.g. "/resume.pdf" once the file is in /public. The button is hidden while undefined.
  resumeUrl: undefined as string | undefined,
  socials: [
    { key: "github", name: "GitHub", url: "https://github.com/emmzyrayz" },
    {
      key: "linkedin",
      name: "LinkedIn",
      url: "https://www.linkedin.com/in/nnamdi-dike-604522281",
    },
    { key: "x", name: "X (Twitter)", url: "https://www.x.com/okayinterrupt" },
    {
      key: "reddit",
      name: "Reddit",
      url: "https://www.reddit.com/u/okeyinterrupt",
    },
    {
      key: "facebook",
      name: "Facebook",
      url: "https://www.facebook.com/Nnamdidike0029",
    },
  ] satisfies Social[],
};

export const navLinks = [
  { label: "About", href: "#about" },
  { label: "Skills", href: "#skills" },
  { label: "Projects", href: "#projects" },
  { label: "Contact", href: "#contact" },
];

export const aboutParagraphs = [
  "I am a full-stack web developer and an Industrial Mathematics undergraduate at Nnamdi Azikiwe University. I specialize in building modern, high-performance web applications using the Next.js and React ecosystem, alongside robust backend architectures with Node.js, Express, and MongoDB.",
  "My approach to development blends the analytical problem-solving of my mathematics background with a strong eye for user interface design. I enjoy crafting clean, glassmorphism-inspired dark themes and optimizing web performance, particularly for low-bandwidth networks. I've engineered custom platforms like the DIUSCADI digital portal, the UniArchive web application, and scalable hotel booking systems, taking them from database schema design all the way to Vercel deployment.",
  "When I'm not writing TypeScript in Cursor or tinkering with my CLI tools, I enjoy unwinding by watching anime, catching up on Korean thrillers, or playing games like SP Football Life and Minecraft.",
];

export type Profile = typeof profile;
