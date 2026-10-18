import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-6xl px-6 pb-16 pt-28 print:max-w-none print:p-0">{children}</main>;
}
