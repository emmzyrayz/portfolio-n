import { profile } from "@/content/profile";

const START_YEAR = 2023;

async function Years() {
  "use cache";
  const now = new Date().getFullYear();
  return <>{now > START_YEAR ? `${START_YEAR}-${now}` : START_YEAR}</>;
}

export function Footer() {
  return (
    <footer className="bg-ink px-4 py-6 text-paper lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <span className="text-lg font-semibold">{profile.fullName}</span>
        <p className="text-sm text-zinc-300">
          &copy; <Years /> &middot; Built by {profile.firstName}
        </p>
      </div>
    </footer>
  );
}
