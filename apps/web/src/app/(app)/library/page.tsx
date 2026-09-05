"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, MoreVertical, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Input } from "@veda/ui";
import { EmptyAssignments } from "@/components/empty-assignments";
import { PaperSheet, PaperSkeleton } from "@/components/paper-sheet";
import { apiRequest } from "@/lib/api";

type Assignment = {
  _id: string;
  name: string;
  dueDate: string;
  createdAt: string;
  status: string;
};

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<string>();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["assignments", search],
    queryFn: () => apiRequest<{ items: Assignment[] }>(`/assignments?search=${encodeURIComponent(search)}`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/assignments/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
  });

  const assignments = list.data?.items || [];
  if (!list.isLoading && !search && assignments.length === 0) {
    return (
      <EmptyAssignments
        title="Library is empty"
        description="Generated papers live here as a stack of exam sheets. Create an assignment to add the first one."
      />
    );
  }

  return (
    <section className="mx-auto max-w-[1420px] pt-5 md:pt-7">
      <div className="mb-5 hidden md:block">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#f45c36]" />
          <h1 className="text-2xl font-bold">My Library</h1>
        </div>
        <p className="mt-1 text-[#909090]">View and manage all your generated materials.</p>
      </div>
      <div className="mb-4 flex items-center gap-3 rounded-[16px] bg-white p-3 md:mb-5 md:h-[74px] md:px-6">
        <button className="flex items-center gap-2 text-sm text-[#9a9a9a]"><Filter size={18} /> Filter</button>
        <div className="relative ml-auto w-full md:max-w-[430px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#aaa]" size={18} />
          <Input aria-label="Search library" className="pl-11" placeholder="Search Name" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      {list.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <PaperSkeleton key={index} compact />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <PaperSheet className="px-6 py-16 text-center">
          <p className="text-sm leading-7 text-[#777]">No papers match that search.</p>
        </PaperSheet>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map((assignment, index) => (
            <motion.article
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035 }}
              key={assignment._id}
              className="paper-sheet relative flex min-h-[118px] flex-col justify-between p-5 md:min-h-[174px] md:p-7"
            >
              <div className="pr-10">
                <Link href={`/assignments/${assignment._id}`} className="text-lg font-bold md:text-2xl">{assignment.name}</Link>
              </div>
              <button onClick={() => setMenu(menu === assignment._id ? undefined : assignment._id)} aria-label="Assignment actions" className="absolute right-5 top-5">
                <MoreVertical />
              </button>
              <AnimatePresence>
                {menu === assignment._id && (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-12 top-12 z-10 w-40 rounded-[12px] bg-white p-2 shadow-surface">
                    <Link className="block rounded-[7px] p-3 text-sm hover:bg-[#f5f5f5]" href={`/assignments/${assignment._id}`}>View Assignment</Link>
                    <button onClick={() => remove.mutate(assignment._id)} className="block w-full rounded-[7px] p-3 text-left text-sm text-red-600 hover:bg-red-50">Delete</button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="mt-7 flex gap-4 text-sm text-[#7b7b7b] md:justify-between md:text-base">
                <p><strong className="text-[#303030]">Assigned on :</strong> {new Date(assignment.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}</p>
                <p><strong className="text-[#303030]">Due :</strong> {new Date(assignment.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}</p>
              </div>
            </motion.article>
          ))}
        </div>
      )}
      <Button asChild className="fixed bottom-6 left-1/2 hidden -translate-x-1/2 md:flex">
        <Link href="/assignments/new"><Plus size={17} /> Create Assignment</Link>
      </Button>
    </section>
  );
}
