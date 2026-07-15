"use client";

import { Button, Input, Label } from "@veda/ui";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { apiRequest } from "@/lib/api";

export default function AcceptInvitePage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest(`/invites/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      router.replace("/assignments");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Invitation could not be accepted.");
    }
  }

  return (
    <AuthFrame title="Join your school" subtitle="Set up your teacher account to access PaperPilot.">
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="name">Name</Label><Input required id="name" name="name" /></div>
        <div><Label htmlFor="email">Email</Label><Input required id="email" name="email" type="email" /></div>
        <div><Label htmlFor="password">Password</Label><Input required minLength={8} id="password" name="password" type="password" /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" size="lg">Accept invitation</Button>
      </form>
    </AuthFrame>
  );
}
