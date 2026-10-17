import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { verifySession } from "@/lib/dal";

export default function DashboardPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Overview />
    </Suspense>
  );
}

// Reads the session cookie, so it streams in behind the Suspense boundary.
async function Overview() {
  const session = await verifySession();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p>Signed in as {session.email}.</p>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border-2 border-ink px-6 py-2.5 font-bold transition-colors duration-300 hover:bg-ink hover:text-paper"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
