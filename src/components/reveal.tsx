"use client";

import type { CSSProperties, ReactNode } from "react";
import { useInView } from "@/hooks/use-in-view";

const variants = {
  "fade-up": "animate-fade-up",
  "slide-left": "animate-slide-left",
  "slide-right": "animate-slide-right",
} as const;

type RevealProps = {
  children: ReactNode;
  variant?: keyof typeof variants;
  /** Delay in milliseconds. */
  delay?: number;
  className?: string;
};

/** Animates its children in the first time they scroll into view. */
export function Reveal({ children, variant = "fade-up", delay = 0, className = "" }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const style: CSSProperties | undefined = delay ? { animationDelay: `${delay}ms` } : undefined;

  return (
    <div
      ref={ref}
      style={style}
      className={`${inView ? variants[variant] : "opacity-0"} motion-reduce:animate-none motion-reduce:opacity-100 ${className}`}
    >
      {children}
    </div>
  );
}
