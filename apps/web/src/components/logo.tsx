import { cn } from "@veda/ui";

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 font-bold text-[#242424]", className)}>
      <span className="flex size-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-[#ed7418] via-[#d6521d] to-[#4b1824] text-[24px] font-black text-white">
        P
      </span>
      {!compact && <span className="text-[28px] tracking-normal">PaperPilot</span>}
    </div>
  );
}
