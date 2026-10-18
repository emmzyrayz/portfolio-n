import { connection } from "next/server";
import { renderCvPdf } from "@/components/cv/cv-pdf";
import { getPublishedCv } from "@/lib/cv-admin";

// Public: renders whichever CV the owner published, on demand (nothing is stored). A one-page PDF
// renders in a fraction of a second, so there is no app-level cache to invalidate; the CDN hint
// below keeps repeat hits cheap while a publish/edit shows up within about a minute.
export async function GET() {
  await connection(); // always request-time: never prerendered at build, never a baked-in 404

  const cv = await getPublishedCv();
  if (!cv) return new Response("No resume has been published yet.", { status: 404 });

  const buffer = await renderCvPdf(cv.content);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="resume.pdf"',
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
