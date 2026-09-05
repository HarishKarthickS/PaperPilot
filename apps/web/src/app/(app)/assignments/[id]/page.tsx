"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GenerationSocketPayload } from "@veda/contracts";
import { AlertTriangle, Download, Files, RefreshCw, Share2, SlidersHorizontal } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Badge, Button } from "@veda/ui";
import { GenerationBanner } from "@/components/generation-banner";
import { PaperSheet, PaperSkeleton } from "@/components/paper-sheet";
import { PaperView, type Section } from "@/components/paper-view";
import { apiRequest, apiUrl, type Session } from "@/lib/api";
import { generationDisplayState, type LatestRun } from "@/lib/generation-state";

type AssignmentDetail = {
  assignment: {
    _id: string;
    name: string;
    subject: string;
    grade: string;
    timeLimit: number;
    totalMarks: number;
    status: string;
  };
  revision: null | { _id: string; version: number; sections: Section[] };
  latestRun: LatestRun | null;
};

export default function AssessmentPaperPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showAnswers, setShowAnswers] = useState(false);
  const [liveRun, setLiveRun] = useState<LatestRun | null>(null);
  const detail = useQuery({
    queryKey: ["assignment", id],
    queryFn: () => apiRequest<AssignmentDetail>(`/assignments/${id}`),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) => {
      const assignment = query.state.data?.assignment;
      if (!assignment) return 10_000;
      if (
        query.state.data?.latestRun &&
        ["queued", "processing", "generating", "parsing", "finalizing"].includes(query.state.data.latestRun.status)
      ) {
        return 4_000;
      }
      if (query.state.data?.revision) return false;
      return ["queued", "processing", "generating", "parsing", "finalizing"].includes(assignment.status) ? 4_000 : false;
    },
  });
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => apiRequest<Session>("/session"),
    staleTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const action = useMutation({
    mutationFn: (request: { path: string; body?: unknown; generates?: boolean }) =>
      apiRequest(request.path, { method: "POST", body: request.body ? JSON.stringify(request.body) : undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assignment", id] });
    },
  });

  useEffect(() => {
    setLiveRun(detail.data?.latestRun || null);
  }, [detail.data?.latestRun]);

  useEffect(() => {
    if (!id) return;
    const socket = io(apiUrl, { withCredentials: true, transports: ["websocket", "polling"] });
    const applyEvent = (payload: GenerationSocketPayload) => {
      setLiveRun(payload);
      if (payload.status === "completed" || payload.status === "failed") {
        void queryClient.invalidateQueries({ queryKey: ["assignment", id] });
      }
    };
    socket.on("connect", () => socket.emit("watch_assignment", id));
    socket.on("generation_started", applyEvent);
    socket.on("generation_progress", applyEvent);
    socket.on("section_generated", applyEvent);
    socket.on("generation_completed", applyEvent);
    socket.on("generation_failed", applyEvent);
    return () => {
      socket.emit("unwatch_assignment", id);
      socket.disconnect();
    };
  }, [id, queryClient]);

  async function downloadPdf(variant: "student" | "teacher") {
    const artifact = await apiRequest<{ _id: string }>(`/assignments/${id}/exports`, {
      method: "POST",
      body: JSON.stringify({ variant, template: "modern" }),
    });
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const exports = await apiRequest<Array<{ _id: string; status: string }>>(`/assignments/${id}/exports`);
      if (exports.find((item) => item._id === artifact._id)?.status === "completed") {
        const signed = await apiRequest<{ ufsUrl: string }>(`/assignments/${id}/exports/${artifact._id}/access`);
        const newWindow = window.open(signed.ufsUrl, "_blank", "noopener,noreferrer");
        if (!newWindow) {
          alert("Pop-up blocked. Please allow pop-ups and redirects for this site to download the PDF.");
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const generated = Boolean(detail.data?.revision);
  const assignment = detail.data?.assignment;
  const runState = generationDisplayState({
    assignmentStatus: assignment?.status,
    generated,
    latestRun: liveRun || detail.data?.latestRun,
  });
  const currentlyGenerating = action.isPending || runState.active;
  const isFailed = runState.failed && !currentlyGenerating;
  const school = session.data?.workspace.name || "Delhi Public School, Sector-4, Bokaro";
  const user = session.data?.user;

  return (
    <section className="mx-auto max-w-[1240px] py-3 md:py-5">
      <GenerationBanner
        message={runState.message}
        progress={runState.progress}
        complete={runState.complete}
        failed={isFailed}
        userName={user?.name}
        subject={assignment?.subject}
        grade={assignment?.grade}
        onDownload={() => downloadPdf("student")}
      />
      {generated && detail.data ? (
        <>
          {isFailed && (
            <div className="mt-3 rounded-[12px] border border-[#ffd5c8] bg-[#fff7f4] p-4 text-sm text-[#88321e]">
              The latest generation request failed, but your previous paper is still available. {runState.userError}
            </div>
          )}
          <div className="paper-toolbar paper-sheet mt-4 flex flex-wrap items-center gap-2 p-3 md:mt-5">
            <Button disabled={currentlyGenerating} onClick={() => downloadPdf("student")}><Download size={16} /> Student PDF</Button>
            <Button disabled={currentlyGenerating} variant="secondary" onClick={() => downloadPdf("teacher")}><Download size={16} /> Answer Key PDF</Button>
            <Button variant="secondary" onClick={() => setShowAnswers((current) => !current)}>
              {showAnswers ? "Hide" : "Show"} answer key
            </Button>
            <Button disabled={currentlyGenerating} variant="ghost" onClick={() => action.mutate({ path: `/assignments/${id}/rebalance`, generates: true })}>
              <SlidersHorizontal size={16} /> {currentlyGenerating ? "Generating" : "Rebalance"}
            </Button>
            <Button variant="ghost" onClick={() => navigator.clipboard.writeText(window.location.href)}><Share2 size={16} /> Share</Button>
            <Button disabled={currentlyGenerating} variant="ghost" onClick={() => action.mutate({ path: `/assignments/${id}/duplicate` })}><Files size={16} /> Duplicate</Button>
            <Badge className="ml-auto">Revision {detail.data.revision!.version}</Badge>
          </div>
          <PaperView
            assignment={{ ...detail.data.assignment, school }}
            sections={detail.data.revision!.sections}
            showAnswers={showAnswers}
            disabled={currentlyGenerating}
            onRegenerateQuestion={(questionId) => {
              if (!currentlyGenerating) action.mutate({ path: `/assignments/${id}/regenerate-question/${questionId}`, generates: true });
            }}
            onRegenerateSection={(sectionId) => {
              if (!currentlyGenerating) action.mutate({ path: `/assignments/${id}/regenerate-section/${sectionId}`, generates: true });
            }}
            onSaveSections={(sections) =>
              action.mutate({ path: `/assignments/${id}/manual-revision`, body: { sections } }, {
                onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignment", id] }),
              })
            }
          />
        </>
      ) : isFailed && detail.data ? (
        <PaperSheet className="mt-4 p-8 md:p-10">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-[#fff1eb] p-3 text-[#f77755]">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-lg font-semibold text-[#202020]">Generation failed before the paper was created.</p>
                <p className="mt-1 text-sm text-[#6c6c6c]">
                  The assignment details are saved, so you can retry generation without re-entering everything.
                  {runState.userError ? ` ${runState.userError}` : ""}
                </p>
              </div>
            </div>
            <Button disabled={currentlyGenerating} onClick={() => action.mutate({ path: `/assignments/${id}/generate`, generates: true })}>
              <RefreshCw size={16} /> Try again
            </Button>
          </div>
        </PaperSheet>
      ) : detail.isError ? (
        <PaperSheet className="mt-5 p-10 text-center">
          <p className="font-semibold">Assessment could not be loaded.</p>
          <Button className="mt-5" onClick={() => detail.refetch()}><RefreshCw size={16} /> Try again</Button>
        </PaperSheet>
      ) : (
        <div className="mt-4">
          <PaperSkeleton label={runState.message || "Preparing question paper…"} />
        </div>
      )}
    </section>
  );
}
