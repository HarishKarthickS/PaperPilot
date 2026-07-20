"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  Book,
  ChevronDown,
  Contact,
  FileText,
  LayoutGrid,
  Menu,
  MessageCircle,
  PieChart,
  Plus,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, cn } from "@veda/ui";
import { apiRequest, type Session } from "@/lib/api";
import { fallbackAvatar } from "@/lib/avatar";
import { Logo } from "./logo";
import type { LucideIcon } from "lucide-react";

type Assignment = {
  _id: string;
  name: string;
  dueDate: string;
  createdAt: string;
  status: string;
};

type ActivityEvent = {
  _id: string;
  action: string;
  createdAt: string;
  actorId?: { name: string; avatar?: string };
  assignmentId?: { _id: string; name: string };
};

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  showBadge?: boolean;
};

function formatAction(action: string) {
  const map: Record<string, string> = {
    ASSIGNMENT_CREATED: "created a new assignment",
    ASSIGNMENT_DUPLICATED: "duplicated an assignment",
    REVISION_SAVED: "saved a manual revision for",
    EXPORT_REQUESTED: "requested a PDF export for",
    DOCUMENT_UPLOADED: "uploaded a new document for",
    GENERATION_QUEUED: "queued an AI generation for",
    MEMBER_INVITED: "invited a new member to the workspace",
    MEMBER_JOINED: "joined the workspace",
  };
  return map[action] || action.replace(/_/g, " ").toLowerCase();
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const sidebarNavigation: NavigationItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutGrid },
  { label: "My Groups", href: "/workspace/members", icon: Contact },
  { label: "Assignments", href: "/assignments", icon: FileText },
  { label: "AI Teacher's Toolkit", href: "/assignments/new", icon: Book },
  { label: "Study Chat", href: "/study-chat", icon: MessageCircle },
  { label: "My Library", href: "/library", icon: PieChart },
];

const mobileNavigation = [
  { label: "Home", href: "/dashboard", icon: LayoutGrid },
  { label: "Assignments", href: "/assignments", icon: FileText },
  { label: "Study Chat", href: "/study-chat", icon: MessageCircle },
  { label: "AI Toolkit", href: "/assignments/new", icon: Sparkles },
];

export function AppShell({ children, title = "Assignment" }: { children: ReactNode; title?: string }) {
  const path = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const contentFirstNavigation = path === "/assignments/new" || /^\/assignments\/[^/]+$/.test(path);
  const session = useQuery({ queryKey: ["session"], queryFn: () => apiRequest<Session>("/session") });
  const activitiesList = useQuery({
    queryKey: ["activities"],
    queryFn: () => apiRequest<ActivityEvent[]>("/activities"),
    enabled: notificationsOpen,
  });
  const assignmentList = useQuery({
    queryKey: ["assignments", ""],
    queryFn: () => apiRequest<{ items: Assignment[] }>("/assignments?search="),
    staleTime: 60_000,
  });
  const workspace = session.data?.workspace;
  const user = session.data?.user;
  const assignmentCount = assignmentList.data?.items?.length ?? 0;

  const isAssignmentsPage = path === "/assignments";
  const isAssignmentDetail = /^\/assignments\/[^/]+$/.test(path);
  const showMobileSubHeader = isAssignmentsPage || isAssignmentDetail;
  const mobileSubTitle = isAssignmentsPage ? "Assignments" : isAssignmentDetail ? "Assignment" : "";

  return (
    <div className="min-h-screen bg-[#ececec] text-[#282828] md:flex">
      <aside className="app-navigation fixed bottom-3 left-3 top-3 z-20 hidden w-[272px] flex-col overflow-hidden rounded-[24px] bg-white px-6 py-7 shadow-sidebar md:flex">
        <Logo className="ml-1" />
        <Button asChild variant="accent" className="mt-14 w-full h-12">
          <Link href="/assignments/new"><Sparkles size={17} /> Create Assignment</Link>
        </Button>
        <nav className="mt-14 space-y-3">
          {sidebarNavigation.map(({ href, icon: Icon, label, showBadge }) => {
            const active = path === href || (href === "/assignments" && path.startsWith("/assignments/") && path !== "/assignments/new");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-[7px] px-4 text-sm text-[#777] transition hover:bg-[#f1f1f1]",
                  active && "bg-[#eeeeee] font-semibold text-[#333]",
                )}
              >
                <Icon size={19} /> {label}
                {showBadge && assignmentCount > 0 && (
                  <span className="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-[#f77755] text-[10px] font-bold text-white">
                    {assignmentCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <Link href="/settings" className="mt-auto flex items-center gap-3 px-4 py-4 text-sm text-[#777]">
          <Settings size={18} /> Settings
        </Link>
        <div className="flex items-center gap-3 rounded-[16px] bg-[#f7f5f5] p-3 border border-transparent">
          <div className="flex size-11 items-center justify-center rounded-full bg-[#ffe0d6] font-bold overflow-hidden">
            <img src={user?.avatar || fallbackAvatar(user?.name, session.data?.role)} alt="avatar" className="size-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{workspace?.name || "Delhi Public School"}</p>
            <p className="truncate text-xs text-[#777]">{workspace?.city || "Bokaro Steel City"}</p>
          </div>
        </div>
      </aside>

      <div className={cn("flex min-h-screen min-w-0 flex-1 flex-col md:ml-[288px] md:pb-0", contentFirstNavigation ? "pb-0" : "pb-[92px]")}>
        <header className="app-navigation m-3 flex h-[62px] shrink-0 items-center justify-between rounded-[16px] bg-white px-4 md:mr-4 md:ml-4 md:mt-4 md:px-7">
          <div className="flex items-center gap-3">
            <div className="md:hidden"><Logo compact /></div>
            <div className="hidden items-center gap-3 md:flex">
              <button onClick={() => router.back()} className="text-[#555] hover:text-[#222]" aria-label="Go back">
                <ArrowLeft size={20} />
              </button>
              <LayoutGrid size={18} className="text-[#969696]" />
              <span className="text-sm text-[#969696]">{title}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                aria-label="Notifications" 
                className="relative flex size-10 items-center justify-center rounded-full bg-[#fafafa] transition hover:bg-[#f0f0f0]"
              >
                <Bell size={21} />
                {activitiesList.data?.length ? <span className="absolute right-2 top-2 size-2 rounded-full bg-[#f45c36]" /> : null}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-[48px] z-30 w-[280px] rounded-[12px] bg-white p-3 shadow-surface">
                  <h3 className="mb-2 px-2 text-sm font-semibold">Notifications</h3>
                  {activitiesList.isLoading ? (
                    <div className="px-2 py-3 text-sm text-[#888]">Loading...</div>
                  ) : activitiesList.data?.length ? (
                    <div className="max-h-[300px] space-y-1 overflow-y-auto">
                      {activitiesList.data.map(activity => (
                        <div key={activity._id} className="flex items-start gap-3 rounded-[8px] p-2 text-sm hover:bg-[#f5f5f5]">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ffe0d6] font-bold">
                            <img src={activity.actorId?.avatar || fallbackAvatar(activity.actorId?.name, "TEACHER")} alt="avatar" className="size-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[#333]">
                              <span className="font-semibold">{activity.actorId?.name}</span> {formatAction(activity.action)} {activity.assignmentId?.name ? <span className="font-medium text-black">"{activity.assignmentId.name}"</span> : ""}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[#888]">{formatRelativeTime(activity.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-2 py-3 text-sm text-[#888]">No recent notifications.</div>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setProfileOpen((open) => !open)} className="hidden items-center gap-2 sm:flex" aria-label="Open profile menu" aria-expanded={profileOpen}>
              <div className="flex size-9 items-center justify-center rounded-full bg-[#ffe0d6] text-xs font-bold overflow-hidden">
                <img src={user?.avatar || fallbackAvatar(user?.name, session.data?.role)} alt="avatar" className="size-full object-cover" />
              </div>
              <span className="text-sm font-semibold">{user?.name || "John Doe"}</span>
              <ChevronDown size={16} />
            </button>
            <button onClick={() => setProfileOpen((open) => !open)} aria-label="Open profile menu" className="md:hidden"><Menu size={22} /></button>
            {profileOpen && (
              <div className="absolute right-4 top-[66px] z-30 w-52 rounded-[8px] bg-white p-2 shadow-surface">
                <p className="truncate px-3 py-2 text-xs text-[#777]">{user?.email || "Teacher account"}</p>
                <Link onClick={() => setProfileOpen(false)} href="/settings" className="block rounded-[7px] px-3 py-2 text-sm hover:bg-[#f3f3f3]">Settings</Link>
                <Link onClick={() => setProfileOpen(false)} href="/workspace/members" className="block rounded-[7px] px-3 py-2 text-sm hover:bg-[#f3f3f3]">Members</Link>
                <button
                  className="mt-1 block w-full rounded-[7px] px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    await apiRequest("/auth/logout", { method: "POST" });
                    router.replace("/auth/login");
                    router.refresh();
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>
        {showMobileSubHeader && (
          <div className="mx-3 flex items-center gap-3 py-2 md:hidden">
            <button onClick={() => router.back()} className="flex size-9 items-center justify-center rounded-full text-[#333]" aria-label="Go back">
              <ArrowLeft size={20} />
            </button>
            <h1 className="flex-1 text-center text-base font-semibold">{mobileSubTitle}</h1>
            <div className="size-9" />
          </div>
        )}
        <main className="min-w-0 flex-1 px-3 pb-5 md:px-8 md:pb-8">{children}</main>
      </div>

      <nav
        className={cn(
          "app-navigation z-20 h-[72px] items-center justify-around rounded-[22px] bg-[#171717] text-white shadow-surface md:hidden",
          contentFirstNavigation ? "mx-3 mb-3 flex" : "fixed bottom-3 left-3 right-3 flex",
        )}
      >
        {mobileNavigation.map(({ href, icon: Icon, label }) => {
          const active = path === href || (href === "/assignments" && path.startsWith("/assignments/") && path !== "/assignments/new");
          return (
            <Link key={href} href={href} className={cn("flex flex-col items-center gap-1 text-[11px] text-[#707070]", active && "text-white")}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      {path === "/assignments" && (
        <Button asChild size="icon" variant="secondary" className="fixed bottom-[98px] right-5 z-10 text-[#f05c38] md:hidden">
          <Link aria-label="New assignment" href="/assignments/new"><Plus size={20} /></Link>
        </Button>
      )}
    </div>
  );
}
