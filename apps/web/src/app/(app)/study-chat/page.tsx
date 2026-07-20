"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, BookOpen } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Card, cn } from "@veda/ui";
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
    return <p className="py-16 text-center text-sm text-[#888]">Loading Study Chat…</p>;
  }

  if (!features.data?.studyChatAvailable) {
    return (
      <section className="mx-auto max-w-3xl py-10">
        <Card className="rounded-[12px] p-8">
          <MessageCircle className="mb-4 text-[#ec6542]" size={28} />
          <h1 className="text-2xl font-bold">Study Chat</h1>
          <p className="mt-3 text-sm leading-6 text-[#666]">
            Study Chat is a separate feature for asking questions about your uploaded study material. It is
            independent from assessment generation and is currently not enabled on this server.
          </p>
          <p className="mt-4 text-sm leading-6 text-[#666]">
            To enable it, set <code className="rounded bg-[#f5f5f5] px-1">ENABLE_RAG=true</code>, provide a
            Postgres pgvector <code className="rounded bg-[#f5f5f5] px-1">DATABASE_URL</code>, and ensure{" "}
            <code className="rounded bg-[#f5f5f5] px-1">OPENROUTER_API_KEY</code> is set. Then run{" "}
            <code className="rounded bg-[#f5f5f5] px-1">docker compose up postgres -d</code>.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-[1100px] flex-col gap-5 py-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Study Chat</h1>
        <p className="mt-2 text-sm text-[#7e7e7e]">
          Ask questions about extracted study documents. This does not change assessment generation.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="rounded-[12px] p-4">
          <p className="mb-3 text-sm font-semibold">Source documents</p>
          {!sources.data?.length ? (
            <p className="text-sm text-[#888]">
              No extracted documents yet. Upload material while creating an assessment, then return here.
            </p>
          ) : (
            <ul className="space-y-2">
              {sources.data.map((source) => (
                <li key={source._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSourceId(source._id);
                      setSessionId("");
                      setLocalMessages([]);
                    }}
                    className={cn(
                      "w-full rounded-[10px] border px-3 py-3 text-left transition",
                      selectedSourceId === source._id
                        ? "border-[#ec6542] bg-[#fff7f4]"
                        : "border-[#ececec] hover:border-[#d8d8d8]",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <BookOpen size={16} className="mt-0.5 shrink-0 text-[#ec6542]" />
                      <span>
                        <span className="block text-sm font-medium">{source.fileName}</span>
                        <span className="mt-1 block text-xs text-[#888]">{statusLabel(source.ragIndexStatus)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button
            className="mt-4 w-full"
            disabled={!selectedSourceId || startSession.isPending}
            onClick={() => startSession.mutate()}
          >
            {startSession.isPending ? "Starting…" : "Start chat"}
          </Button>
          {startSession.isError ? (
            <p className="mt-2 text-xs text-red-600">{(startSession.error as Error).message}</p>
          ) : null}
        </Card>

        <Card className="flex min-h-[520px] flex-col rounded-[12px] p-4 md:p-5">
          {!sessionId ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <MessageCircle className="mb-3 text-[#ccc]" size={32} />
              <p className="text-sm text-[#888]">Select a document and start a chat session.</p>
              {selectedSource ? (
                <p className="mt-2 text-xs text-[#aaa]">Index status: {statusLabel(selectedSource.ragIndexStatus)}</p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mb-4 border-b border-[#f0f0f0] pb-3">
                <p className="font-semibold">{session.data?.source?.fileName || selectedSource?.fileName || "Study chat"}</p>
                <p className="text-xs text-[#888]">
                  Index: {statusLabel(session.data?.source?.ragIndexStatus || selectedSource?.ragIndexStatus)}
                </p>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {localMessages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-[#888]">Ask anything about this document.</p>
                ) : (
                  localMessages.map((message) => (
                    <div
                      key={message._id}
                      className={cn(
                        "max-w-[90%] rounded-[12px] px-4 py-3 text-sm leading-6",
                        message.role === "user"
                          ? "ml-auto bg-[#171717] text-white"
                          : "mr-auto bg-[#f6f6f6] text-[#222]",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.role === "assistant" && groundingLabel(message.groundingStatus) ? (
                        <p
                          className={cn(
                            "mt-2 text-xs font-medium",
                            message.groundingStatus === "rejected" ? "text-amber-700" : "text-[#2f6f4e]",
                          )}
                        >
                          {groundingLabel(message.groundingStatus)}
                          {typeof message.latencyMs === "number" ? ` · ${message.latencyMs} ms` : null}
                        </p>
                      ) : null}
                      {message.role === "assistant" && message.citations?.length ? (
                        <div className="mt-3 space-y-2 border-t border-[#e5e5e5] pt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#888]">Citations</p>
                          {message.citations.map((citation) => (
                            <p key={`${message._id}-${citation.chunkIndex}`} className="text-xs text-[#666]">
                              <span className="font-medium text-[#ec6542]">Chunk {citation.chunkIndex}:</span>{" "}
                              {citation.snippet}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={onSubmit} className="mt-4 flex gap-2 border-t border-[#f0f0f0] pt-4">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask a question about this material…"
                  className="h-11 flex-1 rounded-[10px] border border-[#e5e5e5] px-3 text-sm outline-none focus:border-[#ec6542]"
                  disabled={sendMessage.isPending}
                />
                <Button type="submit" disabled={sendMessage.isPending || !draft.trim()}>
                  <Send size={16} />
                  {sendMessage.isPending ? "Sending" : "Send"}
                </Button>
              </form>
              {sendMessage.isError ? (
                <p className="mt-2 text-xs text-red-600">{(sendMessage.error as Error).message}</p>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </section>
  );
}
