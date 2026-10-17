import { resetSectionAction } from "@/app/actions/content";
import type { ContentSection } from "@/db/schema";

/** Server component: drops saved content so the section serves the static defaults again. */
export function ResetSection({ section }: { section: ContentSection }) {
  return (
    <form action={resetSectionAction.bind(null, section)} className="mt-10 border-t border-zinc-200 pt-6">
      <p className="mb-2 text-sm text-zinc-500">Remove everything you saved here and go back to the built-in defaults.</p>
      <button
        type="submit"
        className="rounded-md border-2 border-error px-4 py-2 text-sm font-semibold text-error transition-colors duration-300 hover:bg-error hover:text-paper"
      >
        Reset to defaults
      </button>
    </form>
  );
}
