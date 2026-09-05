"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, cn } from "@veda/ui";
import { PaperRule, PaperSheet, PaperSkeleton } from "@/components/paper-sheet";
import { apiRequest } from "@/lib/api";

type Features = { studyChatAvailable: boolean };

type StudySource = {
  _id: string;
  fileName: string;
  ragIndexStatus?: "idle" | "queued" | "processing" | "completed" | "failed";
  ragIndexError?: string;
  updatedAt: string;
};

type Citation = { chunkIndex: number; snippet: string };

type GroundingStatus = "verified" | "verified_after_retry" | "rejected";

type ChatMessage = {
  _id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  groundingStatus?: GroundingStatus;
  retryCount?: number;
  latencyMs?: number;
  createdAt: string;
};

function groundingLabel(status?: GroundingStatus) {
  if (status === "verified") return "Verified against retrieved chunks";
  if (status === "verified_after_retry") return "Verified after retry";
  if (status === "rejected") return "Not grounded (refused)";
  return null;
}

type SessionResponse = {
  session: { _id: string; title: string };
  source?: { fileName?: string; ragIndexStatus?: string } | null;
  messages: ChatMessage[];
};

function statusLabel(status?: string) {
  if (status === "completed") return "Ready";
  if (status === "processing" || status === "queued") return "Indexing…";
  if (status === "failed") return "Index failed";
  return "Not indexed";
}

function pairMessages(messages: ChatMessage[]) {
  const pairs: { user: ChatMessage; assistant?: ChatMessage }[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      pairs.push({ user: message });
    } else if (pairs.length && !pairs[pairs.length - 1].assistant) {
      pairs[pairs.length - 1].assistant = message;
    } else {
      pairs.push({ user: { ...message, role: "user", content: "" }, assistant: message });
    }
  }
  return pairs;
}

export default function StudyChatPage() {
  const queryClient = useQueryClient();
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);

  const features = useQuery({
    queryKey: ["features"],
    queryFn: () => apiRequest<Features>("/features"),
  });

  const sources = useQuery({
    queryKey: ["study-chat-sources"],
    queryFn: () => apiRequest<StudySource[]>("/study-chat/sources"),
    enabled: Boolean(features.data?.studyChatAvailable),
    refetchInterval: (query) => {
      const rows = query.state.data;
      return rows?.some((row) => row.ragIndexStatus === "queued" || row.ragIndexStatus === "processing")
        ? 2500
        : false;
    },
  });

  const session = useQuery({
    queryKey: ["study-chat-session", sessionId],
    queryFn: () => apiRequest<SessionResponse>(`/study-chat/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (session.data?.messages) setLocalMessages(session.data.messages);
  }, [session.data?.messages]);

  const selectedSource = useMemo(
    () => sources.data?.find((item) => item._id === selectedSourceId),
    [sources.data, selectedSourceId],
  );

  const startSession = useMutation({
    mutationFn: () =>
      apiRequest<{ session: { _id: string } }>("/study-chat/sessions", {
        method: "POST",
        body: JSON.stringify({ sourceDocumentId: selectedSourceId }),
      }),
    onSuccess: (data) => {
      setSessionId(data.session._id);
      setLocalMessages([]);
      queryClient.invalidateQueries({ queryKey: ["study-chat-sources"] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      apiRequest<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>(
        `/study-chat/sessions/${sessionId}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      ),
    onSuccess: (data) => {
      setLocalMessages((current) => [...current, data.userMessage, data.assistantMessage]);
      setDraft("");
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !sessionId || sendMessage.isPending) return;
    sendMessage.mutate(content);
  }

  if (features.isLoading) {
    return (
      <section className="mx-auto max-w-[1240px] py-3 md:py-5">
        <PaperSkeleton label="Loading Study Chat…" />
      </section>
    );
  }

  if (!features.data?.studyChatAvailable) {
    return (
      <section className="mx-auto max-w-[760px] py-6 md:py-8">
        <PaperSheet className="px-6 py-10 md:px-12 md:py-12">
          <header className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Study material</p>
            <h1 className="mt-2 text-2xl font-bold">Study Chat</h1>
            <PaperRule className="mx-auto mt-3 max-w-[200px]" />
          </header>
          <p className="mt-8 text-sm leading-7 text-[#555]">
            Ask questions about extracted study documents from this same paper view. Study Chat is independent from
            assessment generation and is not enabled on this server.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#555]">
            To enable it, set <code className="rounded bg-[#f5f5f5] px-1">ENABLE_RAG=true</code>, provide a
            Postgres pgvector <code className="rounded bg-[#f5f5f5] px-1">DATABASE_URL</code>, and ensure{" "}
            <code className="rounded bg-[#f5f5f5] px-1">OPENROUTER_API_KEY</code> is set. Then run{" "}
            <code className="rounded bg-[#f5f5f5] px-1">docker compose up postgres -d</code>.
          </p>
        </PaperSheet>
      </section>
    );
  }

  const pairs = pairMessages(localMessages);
  const paperTitle = session.data?.source?.fileName || selectedSource?.fileName || "Study Chat";

  return (
    <section className="mx-auto max-w-[1240px] py-3 md:py-5">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <PaperSheet className="px-5 py-6 md:px-6 md:py-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#888]">Reference list</p>
          <h2 className="mt-2 text-lg font-bold">Source documents</h2>
          <PaperRule className="mt-3 max-w-[140px]" />
          {!sources.data?.length ? (
            <p className="mt-6 text-sm leading-7 text-[#777]">
              No extracted documents yet. Upload material while creating an assessment, then return here.
            </p>
          ) : (
            <ol className="mt-5 space-y-3">
              {sources.data.map((source, index) => (
                <li key={source._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSourceId(source._id);
                      setSessionId("");
                      setLocalMessages([]);
                    }}
                    className={cn(
                      "w-full rounded-sm border px-3 py-2.5 text-left",
                      selectedSourceId === source._id
                        ? "border-[#f66c48] bg-[#fff8f6]"
                        : "border-[#ececec] hover:border-[#d8d8d8]",
                    )}
                  >
                    <span className="block text-sm font-medium leading-5">
                      {index + 1}. {source.fileName}
                    </span>
                    <span className="mt-1 block text-xs text-[#888]">{statusLabel(source.ragIndexStatus)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <Button
            className="mt-6 w-full"
            disabled={!selectedSourceId || startSession.isPending}
            onClick={() => startSession.mutate()}
          >
            {startSession.isPending ? "Opening paper…" : "Open paper"}
          </Button>
          {startSession.isError ? (
            <p className="mt-2 text-xs text-red-600">{(startSession.error as Error).message}</p>
          ) : null}
        </PaperSheet>

        <PaperSheet className="flex min-h-[560px] flex-col px-5 py-7 md:px-10 md:py-10">
          {!sessionId ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Working paper</p>
              <h2 className="mt-3 text-xl font-bold">Select a document</h2>
              <PaperRule className="mx-auto mt-3 max-w-[160px]" />
              <p className="mt-5 max-w-sm text-sm leading-7 text-[#777]">
                Choose a source from the reference list and open it as a paper to ask questions about the extracted
                material.
              </p>
              {selectedSource ? (
                <p className="mt-3 text-xs text-[#999]">Index status: {statusLabel(selectedSource.ragIndexStatus)}</p>
              ) : null}
            </div>
          ) : (
            <>
              <header className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#888]">Study Chat</p>
                <h2 className="mt-2 text-xl font-bold leading-snug md:text-[22px]">{paperTitle}</h2>
                <PaperRule className="mx-auto mt-3 max-w-[220px]" />
                <p className="mt-3 text-xs text-[#888]">
                  Index: {statusLabel(session.data?.source?.ragIndexStatus || selectedSource?.ragIndexStatus)}
                </p>
              </header>

              <div className="mt-8 flex-1 space-y-8">
                {pairs.length === 0 ? (
                  <p className="py-8 text-center text-sm leading-7 text-[#888]">
                    Write a question below. Answers stay on this paper, with citations as footnotes.
                  </p>
                ) : (
                  pairs.map((pair, index) => (
                    <div key={pair.user._id} className="text-sm leading-7">
                      {pair.user.content ? (
                        <p>
                          <span className="font-bold">Q{index + 1}.</span> {pair.user.content}
                        </p>
                      ) : null}
                      {pair.assistant ? (
                        <div className="mt-3">
                          <p className="whitespace-pre-wrap text-[#333]">{pair.assistant.content}</p>
                          {groundingLabel(pair.assistant.groundingStatus) ? (
                            <p
                              className={cn(
                                "mt-2 text-xs",
                                pair.assistant.groundingStatus === "rejected" ? "text-[#9a5a00]" : "text-[#555]",
                              )}
                            >
                              {groundingLabel(pair.assistant.groundingStatus)}
                              {typeof pair.assistant.latencyMs === "number" ? ` · ${pair.assistant.latencyMs} ms` : null}
                            </p>
                          ) : null}
                          {pair.assistant.citations?.length ? (
                            <ol className="mt-3 space-y-1 border-t border-dotted border-[#ddd] pt-3 text-xs text-[#666]">
                              {pair.assistant.citations.map((citation) => (
                                <li key={`${pair.assistant!._id}-${citation.chunkIndex}`}>
                                  <span className="font-semibold text-[#f66c48]">[{citation.chunkIndex}]</span>{" "}
                                  {citation.snippet}
                                </li>
                              ))}
                            </ol>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                {sendMessage.isPending ? (
                  <p className="text-sm italic text-[#888]">Writing answer…</p>
                ) : null}
              </div>

              <form onSubmit={onSubmit} className="mt-8 border-t border-[#ececec] pt-5">
                <label htmlFor="study-question" className="text-xs font-semibold uppercase tracking-[0.12em] text-[#888]">
                  Write your question
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="study-question"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Ask a question about this material…"
                    className="h-11 flex-1 rounded-sm border-0 border-b border-[#d8d8d8] bg-transparent px-0 text-sm outline-none focus:border-[#f66c48]"
                    disabled={sendMessage.isPending}
                  />
                  <Button type="submit" disabled={sendMessage.isPending || !draft.trim()}>
                    <Send size={16} />
                    {sendMessage.isPending ? "Sending" : "Send"}
                  </Button>
                </div>
              </form>
              {sendMessage.isError ? (
                <p className="mt-2 text-xs text-red-600">{(sendMessage.error as Error).message}</p>
              ) : null}
            </>
          )}
        </PaperSheet>
      </div>
    </section>
  );
}
