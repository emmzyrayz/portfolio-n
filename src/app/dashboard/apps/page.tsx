import Link from "next/link";
import { Suspense } from "react";
import { AppCard } from "@/components/apps/app-card";
import { RegisterAppForm } from "@/components/apps/register-app-form";
import { listClientApps } from "@/lib/apps-admin";
import { queryTelemetry } from "@/lib/telemetry-admin";
import { parseInspectorFilters } from "@/lib/telemetry-schemas";

export default function AppsPage({ searchParams }: PageProps<"/dashboard/apps">) {
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Link href="/dashboard" className="w-fit text-sm font-semibold underline underline-offset-4">
        &larr; Dashboard
      </Link>
      <div>
        <h1 className="text-3xl font-bold">API hub: client projects</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Each client project calls <code>/api/hub/v1/*</code> with its identifier in <code>x-app-id</code> and an API key in{" "}
          <code>Authorization: Bearer ...</code>. Keys are stored only as hashes.
        </p>
      </div>
      <RegisterAppForm />
      <Suspense fallback={<p>Loading...</p>}>
        <AppList searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function AppList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [apps, params] = await Promise.all([listClientApps(), searchParams]); // listClientApps verifies the owner session

  // Telemetry events are loaded only for the app being inspected (?inspect=<slug>), with validated filters.
  const inspectSlug = Array.isArray(params.inspect) ? params.inspect[0] : params.inspect;
  const inspected = apps.find((a) => a.slug === inspectSlug);
  const filters = parseInspectorFilters(params);
  const before = Array.isArray(params.before) ? params.before[0] : params.before;
  const page = inspected ? await queryTelemetry(inspected.id, filters, before) : null;

  if (apps.length === 0) return <p className="text-zinc-500">No client projects yet. Register one above.</p>;
  return (
    <div className="flex flex-col gap-4">
      {apps.map((app) => (
        <AppCard key={app.id} app={app} inspector={inspected && page && app.id === inspected.id ? { filters, page } : undefined} />
      ))}
    </div>
  );
}
