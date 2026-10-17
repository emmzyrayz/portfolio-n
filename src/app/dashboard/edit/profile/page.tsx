import { Suspense } from "react";
import { ProfileEditor } from "@/components/dashboard/profile-editor";
import { ResetSection } from "@/components/dashboard/reset-section";
import { getEditableProfile } from "@/lib/content-admin";

export default function ProfilePage({ searchParams }: PageProps<"/dashboard/edit/profile">) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Hero, About &amp; Contact</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Editor({ searchParams }: { searchParams: Promise<{ reset?: string | string[] }> }) {
  // Changing ?reset= remounts the editor after a reset; saves keep the form (and its status message).
  const { reset } = await searchParams;
  const profile = await getEditableProfile(); // verifies the owner session
  return (
    <>
      <ProfileEditor key={String(reset ?? "")} initial={profile} />
      <ResetSection section="profile" />
    </>
  );
}
