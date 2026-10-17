import type { StaticImageData } from "next/image";
import avatar1 from "@/assets/avatar-1.png";
import avatar2 from "@/assets/avatar-2.png";

export type Testimonial = {
  name: string;
  role: string;
  quote: string;
  image: StaticImageData;
};

// PLACEHOLDER: replace with real testimonials (with permission) or remove the section.
export const testimonials: Testimonial[] = [
  {
    name: "Person One",
    role: "Designer",
    quote: "PLACEHOLDER - A short quote about what it was like to work with you.",
    image: avatar1,
  },
  {
    name: "Person Two",
    role: "Developer",
    quote: "PLACEHOLDER - A short quote about what it was like to work with you.",
    image: avatar2,
  },
  {
    name: "Person Three",
    role: "Product Manager",
    quote: "PLACEHOLDER - A short quote about what it was like to work with you.",
    image: avatar2,
  },
];
