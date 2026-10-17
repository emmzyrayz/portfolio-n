import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { getProfile } from "@/lib/content";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

// Profile comes from the cached content reader (DB, or the static fallback).
export async function generateMetadata(): Promise<Metadata> {
  const profile = await getProfile();
  const siteTitle = `${profile.fullName} - ${profile.title} ${profile.subtitle}`;
  return {
    title: { default: siteTitle, template: `%s | ${profile.fullName}` },
    description: profile.summary,
    openGraph: {
      title: siteTitle,
      description: profile.summary,
      siteName: `${profile.fullName} Portfolio`,
      locale: "en_US",
      type: "website",
    },
    twitter: { card: "summary_large_image", title: siteTitle, description: profile.summary },
  };
}

// The navbar is a client component, so the server hands it the profile as props.
async function SiteNavbar() {
  const { fullName, resumeUrl } = await getProfile();
  return <Navbar fullName={fullName} resumeUrl={resumeUrl} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} antialiased`}>
      <body className="flex min-h-screen flex-col font-sans">
        <SiteNavbar />
        <main className="flex-1 overflow-x-clip">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
