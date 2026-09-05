import type { ReactNode } from "react";
import { Logo } from "./logo";

export function AuthFrame({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#ececec] px-4 py-10">
      <div className="paper-sheet w-full max-w-[440px] p-7 sm:p-9">
        <Logo className="mb-10" />
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mb-7 mt-2 text-sm text-[#777]">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
