"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Plus, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Input, Label } from "@veda/ui";
import { PaperSheet } from "@/components/paper-sheet";
import { apiRequest, type Session } from "@/lib/api";

type Member = { id: string; role: "ADMIN" | "TEACHER"; user: { name: string; email: string } };

export default function MembersPage() {
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const session = useQuery({ queryKey: ["session"], queryFn: () => apiRequest<Session>("/session") });
  const members = useQuery({ queryKey: ["members"], queryFn: () => apiRequest<Member[]>("/members") });
  const invite = useMutation({
    mutationFn: () => apiRequest<{ token: string }>("/invites", { method: "POST", body: JSON.stringify({ email: email || undefined, role: "TEACHER" }) }),
    onSuccess: ({ token }) => setInviteUrl(`${window.location.origin}/invite/${token}`),
  });

  return (
    <section className="mx-auto max-w-[980px] py-7">
      <h1 className="text-2xl font-bold">School workspace</h1>
      <p className="mt-2 text-sm text-[#7d7d7d]">Invite teachers and manage access to assessment materials.</p>
      {session.data?.role === "ADMIN" && (
        <PaperSheet className="mt-7 p-5 md:p-7">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold"><Plus size={19} /> Invite a teacher</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="invite-email">Teacher email (optional)</Label>
              <Input id="invite-email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher@school.edu" />
            </div>
            <Button className="mt-auto" onClick={() => invite.mutate()} disabled={invite.isPending}>Create invite link</Button>
          </div>
          {inviteUrl && (
            <div className="mt-5 flex items-center gap-2 rounded-[8px] bg-[#f5f5f5] p-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{inviteUrl}</span>
              <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(inviteUrl)}>
                <Copy size={14} /> Copy
              </Button>
            </div>
          )}
        </PaperSheet>
      )}
      <PaperSheet className="mt-5 p-5 md:p-7">
        <h2 className="mb-5 text-lg font-bold">Members</h2>
        {members.isLoading ? (
          <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading members">
            <div className="h-12 bg-[#f0f0f0]" />
            <div className="h-12 bg-[#f0f0f0]" />
            <div className="h-12 bg-[#f3f3f3]" />
          </div>
        ) : !members.data?.length ? (
          <p className="py-8 text-center text-sm leading-7 text-[#888]">No members yet. Invite a teacher to share papers.</p>
        ) : (
        <div className="divide-y divide-[#ececec]">
          {(members.data || []).map((member) => (
            <div key={member.id} className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#f4f4f4]"><UserRound size={19} /></div>
                <div><p className="font-semibold">{member.user.name}</p><p className="text-sm text-[#777]">{member.user.email}</p></div>
              </div>
              <Badge tone={member.role === "ADMIN" ? "orange" : "default"}>
                {member.role === "ADMIN" && <ShieldCheck className="mr-1" size={13} />}
                {member.role}
              </Badge>
            </div>
          ))}
        </div>
        )}
      </PaperSheet>
    </section>
  );
}
