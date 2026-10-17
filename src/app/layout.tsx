import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { profile } from "@/content/profile";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const siteTitle = `${profile.fullName} - ${profile.title} ${profile.subtitle}`;

export const metadata: Metadata = {
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} antialiased`}>
      <body className="flex min-h-screen flex-col font-sans">
        <Navbar />
        <main className="flex-1 overflow-x-clip">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
