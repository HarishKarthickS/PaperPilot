"use client";

import { useQuery } from "@tanstack/react-query";
import { FileQuestion, GraduationCap, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@veda/ui";
import { PaperSheet, PaperSkeleton } from "@/components/paper-sheet";
import { apiRequest } from "@/lib/api";

type Dashboard = {
  totalGenerated: number;
  totalQuestions: number;
  averageMarks: number;
  recent: Array<{ _id: string; name: string; subject: string; updatedAt: string }>;
};

export default function DashboardPage() {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => apiRequest<Dashboard>("/dashboard") });
  const statistics = [
    { label: "Assessments generated", value: dashboard.data?.totalGenerated || 0, icon: Sparkles },
    { label: "Total questions", value: dashboard.data?.totalQuestions || 0, icon: FileQuestion },
    { label: "Average marks", value: dashboard.data?.averageMarks || 0, icon: GraduationCap },
    { label: "Recent activity", value: dashboard.data?.recent.length || 0, icon: TrendingUp },
  ];

  if (dashboard.isLoading) {
    return (
      <section className="mx-auto max-w-[1240px] py-6">
        <PaperSkeleton label="Loading papers…" />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1320px] py-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Good morning, Teacher</h1>
          <p className="mt-2 text-sm text-[#7e7e7e]">Build thoughtful assessments for every class.</p>
        </div>
        <Button asChild><Link href="/assignments/new"><Sparkles size={17} /> Generate new assessment</Link></Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statistics.map(({ label, value, icon: Icon }) => (
          <PaperSheet key={label} as="div" className="p-5">
            <Icon size={20} className="mb-6 text-[#ec6542]" />
            <p className="text-3xl font-bold">{value}</p>
            <p className="mt-2 text-sm text-[#767676]">{label}</p>
          </PaperSheet>
        ))}
      </div>
      <PaperSheet className="mt-6 p-5 md:p-7">
        <h2 className="mb-5 text-lg font-bold">Recent assessments</h2>
        {!dashboard.data?.recent.length ? (
          <p className="py-10 text-center text-sm leading-7 text-[#888]">Your generated papers will appear here as exam sheets.</p>
        ) : (
          <div className="divide-y divide-[#ededed]">
            {dashboard.data.recent.map((item) => (
              <Link href={`/assignments/${item._id}`} className="flex items-center justify-between py-4" key={item._id}>
                <div><p className="font-semibold">{item.name}</p><p className="text-xs text-[#888]">{item.subject}</p></div>
                <time className="text-xs text-[#888]">{new Date(item.updatedAt).toLocaleDateString()}</time>
              </Link>
            ))}
          </div>
        )}
      </PaperSheet>
    </section>
  );
}
