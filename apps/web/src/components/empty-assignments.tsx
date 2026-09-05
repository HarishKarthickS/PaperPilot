import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@veda/ui";
import { EmptyPaperMark } from "./paper-sheet";

export function EmptyAssignments({
  title = "No question papers yet",
  description = "Create an assignment to generate a curriculum-aware question paper. Papers you generate will appear here as exam sheets you can review and export.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[calc(100vh-142px)] flex-col items-center justify-center px-4 py-12 text-center md:min-h-[calc(100vh-120px)]">
      <EmptyPaperMark />
      <h1 className="mt-6 text-xl font-bold md:text-2xl">{title}</h1>
      <p className="mt-3 max-w-[480px] text-sm leading-7 text-[#7c7c7c] md:text-[15px]">{description}</p>
      <Button asChild className="mt-8">
        <Link href="/assignments/new"><Plus size={17} /> Create your first assignment</Link>
      </Button>
    </div>
  );
}
