import { renderCvPdf } from "@/components/cv/cv-pdf";
import { getCv } from "@/lib/cv-admin";

// Owner-only download of the SAVED CV, rendered on demand (nothing stored).
// getCv() re-verifies the owner session (redirects to /login otherwise), on top of the proxy check.
export async function GET(_request: Request, ctx: RouteContext<"/dashboard/cv/[id]/pdf">) {
  const { id } = await ctx.params;
  const cv = await getCv(id);
  if (!cv) return new Response("Not found", { status: 404 });

  const buffer = await renderCvPdf(cv.content);
  const base = [cv.content.header.fullName, cv.company ?? cv.jobTitle, "CV"].join(" ");
  const filename = base.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") || "CV";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
