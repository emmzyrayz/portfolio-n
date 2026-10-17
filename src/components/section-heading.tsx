import type { ReactNode } from "react";

type SectionHeadingProps = {
  light: string;
  bold: string;
  id?: string;
  className?: string;
  children?: ReactNode;
};

export function SectionHeading({ light, bold, id, className = "" }: SectionHeadingProps) {
  return (
    <h2 id={id} className={`mb-10 text-center text-3xl font-semibold md:text-4xl ${className}`}>
      {light} <span className="font-extrabold">{bold}</span>
    </h2>
  );
}
