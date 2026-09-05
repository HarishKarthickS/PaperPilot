"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, GraduationCap, Pencil, Save, ShieldCheck, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Label, cn } from "@veda/ui";
import { apiRequest, type Session } from "@/lib/api";
import { fallbackAvatar, roleAvatarPresets } from "@/lib/avatar";
import { PaperSheet } from "@/components/paper-sheet";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => apiRequest<Session>("/session") });
  const role = session.data?.role || "TEACHER";
  const user = session.data?.user;
  const workspace = session.data?.workspace;
  const [profile, setProfile] = useState({ name: "", avatar: "" });
  const [school, setSchool] = useState({ name: "", city: "" });
  const [message, setMessage] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [draftAvatar, setDraftAvatar] = useState("");
  const presets = useMemo(() => roleAvatarPresets(role, profile.name || user?.name), [profile.name, role, user?.name]);

  useEffect(() => {
    if (!session.data) return;
    setProfile({
      name: session.data.user.name || "",
      avatar: session.data.user.avatar || fallbackAvatar(session.data.user.name, session.data.role),
    });
    setSchool({
      name: session.data.workspace.name || "",
      city: session.data.workspace.city || "",
    });
  }, [session.data]);

  const saveProfile = useMutation({
    mutationFn: (values: { name: string; avatar: string }) =>
      apiRequest<Session>("/settings/profile", {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["session"], updated);
      setProfile({
        name: updated.user.name || "",
        avatar: updated.user.avatar || fallbackAvatar(updated.user.name, updated.role),
      });
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      setMessage("Profile updated.");
    },
  });

  const saveSchool = useMutation({
    mutationFn: () =>
      apiRequest<Session>("/settings/workspace", {
        method: "PATCH",
        body: JSON.stringify(school),
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["session"], updated);
      setMessage("School updated.");
    },
  });

  const canEditSchool = role === "ADMIN";
  const error = saveProfile.error || saveSchool.error;

  return (
    <section className="mx-auto max-w-[1040px] py-4 md:py-7">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-[#777]">{workspace?.name || "School workspace"}</p>
        </div>
        <Badge tone={role === "ADMIN" ? "orange" : "default"} className="w-fit">
          {role === "ADMIN" && <ShieldCheck className="mr-1" size={13} />}
          {role}
        </Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <PaperSheet className="p-5 md:p-7">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => {
                setDraftAvatar(profile.avatar || fallbackAvatar(profile.name, role));
                setAvatarOpen(true);
              }}
              className="group relative flex size-28 items-center justify-center overflow-hidden rounded-full bg-[#fff0eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f77755]"
              aria-label="Change avatar"
            >
              <img src={profile.avatar || fallbackAvatar(profile.name, role)} alt="Selected profile avatar" className="size-full object-cover" />
              <span className="absolute bottom-1 right-1 flex size-9 items-center justify-center rounded-full bg-[#171717] text-white shadow-sm transition group-hover:bg-[#2b2b2b]">
                <Pencil size={15} />
              </span>
            </button>
            <h2 className="mt-4 text-lg font-bold">{profile.name || user?.name || "Teacher"}</h2>
            <p className="mt-1 text-sm text-[#777]">{user?.email}</p>
          </div>
        </PaperSheet>

        <div className="space-y-5">
          <PaperSheet className="p-5 md:p-7">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-bold">
              <UserRound size={19} /> Profile
            </h2>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={profile.name}
                  onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => saveProfile.mutate(profile)} disabled={saveProfile.isPending || !profile.name.trim()}>
                <Save size={16} /> {saveProfile.isPending ? "Saving" : "Save profile"}
              </Button>
            </div>
          </PaperSheet>

          <PaperSheet className="p-5 md:p-7">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <GraduationCap size={20} /> School
              </h2>
              {!canEditSchool && <Badge>Admin only</Badge>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="school-name">School name</Label>
                <Input
                  id="school-name"
                  value={school.name}
                  disabled={!canEditSchool}
                  onChange={(event) => setSchool((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="school-city">City</Label>
                <Input
                  id="school-city"
                  value={school.city}
                  disabled={!canEditSchool}
                  onChange={(event) => setSchool((current) => ({ ...current, city: event.target.value }))}
                />
              </div>
            </div>
            {canEditSchool && (
              <div className="mt-5 flex justify-end">
                <Button onClick={() => saveSchool.mutate()} disabled={saveSchool.isPending || !school.name.trim() || !school.city.trim()}>
                  <Save size={16} /> {saveSchool.isPending ? "Saving" : "Save school"}
                </Button>
              </div>
            )}
          </PaperSheet>
        </div>
      </div>

      {message && <p className="mt-4 rounded-[8px] bg-green-50 p-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-4 rounded-[8px] bg-red-50 p-3 text-sm text-red-700">{error instanceof Error ? error.message : "Settings could not be saved."}</p>}
      {avatarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="avatar-dialog-title">
          <div className="paper-sheet w-full max-w-[520px] p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="avatar-dialog-title" className="text-lg font-bold">Choose avatar</h2>
                <p className="mt-1 text-sm text-[#777]">{role === "ADMIN" ? "Admin profile options" : "Teacher profile options"}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setAvatarOpen(false)} aria-label="Close avatar picker">
                <X size={18} />
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-5">
              {presets.map((avatar) => {
                const active = draftAvatar === avatar;
                return (
                  <button
                    key={avatar}
                    type="button"
                    onClick={() => setDraftAvatar(avatar)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-full border bg-[#f8f8f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f77755]",
                      active ? "border-[#f77755] ring-2 ring-[#f77755]/30" : "border-[#dedede]",
                    )}
                    aria-label="Choose this avatar"
                    aria-pressed={active}
                  >
                    <img src={avatar} alt="" className="size-full object-cover" />
                    {active && (
                      <span className="absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full bg-[#171717] text-white">
                        <Check size={13} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAvatarOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  const nextProfile = { ...profile, avatar: draftAvatar };
                  setProfile(nextProfile);
                  saveProfile.mutate(nextProfile, { onSuccess: () => setAvatarOpen(false) });
                }}
                disabled={saveProfile.isPending || !draftAvatar}
              >
                <Save size={16} /> {saveProfile.isPending ? "Saving" : "Save avatar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
