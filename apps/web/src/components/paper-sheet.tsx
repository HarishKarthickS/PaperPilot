import React, { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@veda/ui";

type PaperSheetProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  as?: "article" | "section" | "div";
};

export function PaperSheet({ as: Tag = "article", className, children, ...props }: PaperSheetProps) {
  return (
    <Tag className={cn("paper-sheet", className)} {...props}>
      {children}
    </Tag>
  );
}

export function PaperRule({ className }: { className?: string }) {
  return <div className={cn("paper-rule", className)} role="presentation" />;
}

export function PaperSkeleton({ label = "Preparing paper…", compact = false }: { label?: string; compact?: boolean }) {
  if (compact) {
    return (
      <PaperSheet className="min-h-[140px] px-6 py-7" aria-busy="true" aria-label={label || "Loading"}>
        <div className="h-3 w-2/3 bg-[#ececec]" />
        <div className="mt-6 space-y-2.5">
          <div className="h-2.5 w-full bg-[#f0f0f0]" />
          <div className="h-2.5 w-5/6 bg-[#f0f0f0]" />
          <div className="h-2.5 w-2/5 bg-[#f0f0f0]" />
        </div>
      </PaperSheet>
    );
  }

  return (
    <PaperSheet className="px-6 py-10 md:px-12 md:py-14" aria-busy="true" aria-label={label || "Loading"}>
      <div className="mx-auto h-3 w-48 bg-[#ececec]" />
      <PaperRule className="mx-auto mt-4 max-w-[220px]" />
      <div className="mx-auto mt-3 h-2.5 w-36 bg-[#f0f0f0]" />
      <div className="mx-auto mt-2 h-2.5 w-28 bg-[#f0f0f0]" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="h-2.5 bg-[#ececec]"
            style={{ width: `${88 - (index % 3) * 12}%` }}
          />
        ))}
      </div>
      {label ? <p className="mt-10 text-center text-xs tracking-wide text-[#9a9a9a]">{label}</p> : null}
    </PaperSheet>
  );
}

export function EmptyPaperMark() {
  return (
    <svg width="220" height="176" viewBox="0 0 220 176" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="52" y="28" width="112" height="132" rx="3" fill="#f4f4f4" stroke="#d8d8d8" />
      <rect x="40" y="18" width="112" height="132" rx="3" fill="white" stroke="#d0d0d0" />
      <rect x="28" y="8" width="112" height="132" rx="3" fill="white" stroke="#c8c8c8" />
      <rect x="28" y="8" width="112" height="4" fill="#f66c48" />
      <rect x="44" y="28" width="48" height="6" rx="1" fill="#d6d6d6" />
      <rect x="44" y="44" width="80" height="3" rx="1" fill="#e4e4e4" />
      <rect x="44" y="54" width="68" height="3" rx="1" fill="#e4e4e4" />
      <rect x="44" y="64" width="76" height="3" rx="1" fill="#e4e4e4" />
      <rect x="44" y="74" width="52" height="3" rx="1" fill="#e4e4e4" />
      <rect x="44" y="90" width="80" height="3" rx="1" fill="#ececec" />
      <rect x="44" y="100" width="72" height="3" rx="1" fill="#ececec" />
      <rect x="44" y="110" width="60" height="3" rx="1" fill="#ececec" />
    </svg>
  );
}
