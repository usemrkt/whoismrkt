// ─────────────────────────────────────────────────────────────────────────────
// AppShell — persistent platform navigation for all authenticated pages.
//
// Architecture:
//   [sidebar: logo + nav sections + user footer]
//   [flex-1 content: children fills the rest]
//
// Nav sections adapt to account type (creator vs business).
// Active state is derived from the current router pathname.
// Sidebar collapses to icon-only mode; preference is persisted in localStorage.
// ─────────────────────────────────────────────────────────────────────────────

import { Link, useRouterState, useNavigate, useRouter } from "@tanstack/react-router";
import { setPreloadFn, preloadRoute, runAppPreloader, resetPreloader } from "@/lib/appPreloader";
import { cn } from "@/lib/utils";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/site/Logo";
import { toast } from "sonner";
import {
  Layers, Users, Zap, BarChart2, LogOut, Settings,
  Globe, Sparkles, Briefcase,
  CalendarDays, Megaphone, Mail, Bell, X, Menu,
  CheckCheck, UserPlus, Star, AlertCircle, ThumbsUp, ThumbsDown,
  ClipboardList, Bookmark, ShieldCheck, FileText, RotateCcw,
  Home, ChevronLeft, ChevronRight, Wand2, TrendingUp, MessageSquare, DollarSign,
  Compass,
} from "lucide-react";
import { fetchUnreadCount } from "@/lib/messaging";
import {
  fetchNotifications, fetchUnreadNotificationCount,
  markNotificationRead, markAllNotificationsRead,
  type AppNotification,
} from "@/lib/notifications";
import { useI18n, type Lang } from "@/lib/i18n";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  canvas:         "#000",
  base:           "oklch(0.075 0 0)",
  surface:        "oklch(0.11 0 0)",
  raised:         "oklch(0.15 0 0)",
  borderSubtle:   "oklch(1 0 0 / 9%)",
  borderNormal:   "oklch(1 0 0 / 13%)",
  textPrimary:    "oklch(1 0 0 / 92%)",
  textSecondary:  "oklch(1 0 0 / 68%)",
  textTertiary:   "oklch(1 0 0 / 46%)",
  textQuaternary: "oklch(1 0 0 / 30%)",
  textMuted:      "oklch(1 0 0 / 20%)",
  chrome:         "oklch(0.82 0.005 250)",
  accent:         "oklch(0.72 0.14 152)",
  aiBlue:         "oklch(0.72 0.10 224)",
} as const;

// ─── Sidebar collapsed context ────────────────────────────────────────────────

const SidebarCtx = createContext(false);

// ─── Account helpers ──────────────────────────────────────────────────────────

interface ShellProfile {
  name: string | null;
  account_type: string | null;
  onboarding_path: string | null;
}

function isCreator(p: ShellProfile | null) {
  return p?.account_type === "creator" || p?.onboarding_path === "creator";
}

function isBusiness(p: ShellProfile | null) {
  if (!p) return false;
  return (
    p.account_type === "brand" ||
    p.account_type === "business" ||
    p.onboarding_path === "business_creator" ||
    p.onboarding_path === "business_marketing"
  );
}

const AVATAR_COLORS = [
  "oklch(0.68 0.12 25)", "oklch(0.66 0.09 250)",
  "oklch(0.64 0.11 160)", "oklch(0.70 0.10 300)",
  "oklch(0.72 0.09 60)",  "oklch(0.65 0.10 190)",
];
function avatarBg(name: string) {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
}

// ─── Nav primitives ───────────────────────────────────────────────────────────

function NavSection({ label, children }: { label: string; children: ReactNode }) {
  const collapsed = useContext(SidebarCtx);
  if (collapsed) return <div>{children}</div>;
  return (
    <div>
      <div
        className="px-2.5 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.32em]"
        style={{ color: C.textMuted }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function NavDivider() {
  return <div className="my-1" style={{ borderTop: `1px solid ${C.borderSubtle}` }} />;
}

function NavItem({
  icon: Icon, label, to, exact = false, badge, onClick, variant,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
  exact?: boolean;
  badge?: number;
  onClick?: () => void;
  variant?: "ai";
}) {
  const collapsed   = useContext(SidebarCtx);
  const routerState = useRouterState();
  const pathname    = routerState.location.pathname;

  const isActive = exact
    ? pathname === to
    : pathname === to || pathname.startsWith(to + "/") || (to !== "/" && pathname.startsWith(to));

  const isAI        = variant === "ai";
  const activeColor = isAI ? C.aiBlue : C.textPrimary;
  const activeBg    = isAI ? "oklch(0.72 0.10 224 / 10%)" : "oklch(1 0 0 / 9%)";

  if (collapsed) {
    return (
      <div title={label} className="flex justify-center mb-[1px]">
        <Link
          to={to as "/"}
          onClick={onClick}
          onTouchStart={() => preloadRoute(to)}
          className="h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-100 relative"
          style={{
            background: isActive ? activeBg : "transparent",
            color:      isActive ? activeColor : C.textTertiary,
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)";
              (e.currentTarget as HTMLElement).style.color      = C.textSecondary;
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color      = C.textTertiary;
            }
          }}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {badge != null && badge > 0 && (
            <span
              className="absolute top-1 right-1 h-[6px] w-[6px] rounded-full"
              style={{ background: C.accent }}
            />
          )}
        </Link>
      </div>
    );
  }

  return (
    <Link
      to={to as "/"}
      onClick={onClick}
      onTouchStart={() => preloadRoute(to)}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 mb-[1px] text-[13px] font-medium transition-all duration-100",
        isActive && (isAI ? "nav-active-ai" : "nav-active"),
      )}
      style={{
        background: isActive ? activeBg     : "transparent",
        color:      isActive ? activeColor  : C.textTertiary,
        boxShadow:  isActive ? "inset 0 1px 0 oklch(1 0 0 / 8%)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)";
          (e.currentTarget as HTMLElement).style.color      = C.textSecondary;
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color      = C.textTertiary;
        }
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="min-w-[17px] h-[17px] rounded-full px-1 flex items-center justify-center text-[9px] font-bold"
          style={{ background: "oklch(1 0 0 / 10%)", color: "oklch(1 0 0 / 65%)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function NavItemSoon({
  icon: Icon, label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const collapsed = useContext(SidebarCtx);

  if (collapsed) {
    return (
      <div title={`${label} — coming soon`} className="flex justify-center mb-[1px]">
        <button
          type="button"
          onClick={() => toast.info(`${label} is coming soon.`)}
          className="h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-100"
          style={{ color: C.textMuted, cursor: "pointer" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 4%)";
            (e.currentTarget as HTMLElement).style.color      = C.textTertiary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color      = C.textMuted;
          }}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toast.info(`${label} is coming soon.`)}
      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 mb-[1px] text-[13px] font-medium transition-all duration-100 text-left"
      style={{ color: C.textMuted, cursor: "pointer" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 4%)";
        (e.currentTarget as HTMLElement).style.color      = C.textTertiary;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.color      = C.textMuted;
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      <span
        className="text-[8px] uppercase tracking-[0.22em] font-semibold rounded-full px-1.5 py-0.5 shrink-0"
        style={{ background: "oklch(0.78 0.12 60 / 12%)", color: "oklch(0.78 0.12 60 / 55%)", border: "1px solid oklch(0.78 0.12 60 / 18%)" }}
      >
        Soon
      </span>
    </button>
  );
}

// ─── Mobile top bar ───────────────────────────────────────────────────────────

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <div
      className="flex md:hidden flex-col shrink-0"
      style={{ borderBottom: `1px solid ${C.borderSubtle}`, background: C.base, paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
    <div className="h-[52px] px-4 flex items-center justify-between">
      <Link to="/home"><Logo /></Link>
      <button
        type="button"
        onClick={onMenu}
        className="h-8 w-8 flex items-center justify-center rounded-xl transition-colors"
        aria-label="Open navigation"
        style={{ color: C.textTertiary }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
      >
        <Menu className="h-4 w-4" />
      </button>
    </div>
    </div>
  );
}

// ─── Mobile drawer ────────────────────────────────────────────────────────────

function MobileDrawer({
  open, onClose, creatorAccount, businessAccount,
  displayName, avatarUrl, unreadCount, notifCount, onSignOut,
  lang, setLang,
}: {
  open: boolean; onClose: () => void;
  creatorAccount: boolean; businessAccount: boolean;
  displayName: string; avatarUrl: string | null;
  unreadCount: number; notifCount: number;
  onSignOut: () => void;
  lang: Lang; setLang: (l: Lang) => void;
}) {
  const initial = displayName[0]?.toUpperCase() ?? "M";

  return (
    <>
      <div
        className="md:hidden fixed inset-0 z-[300] transition-opacity duration-200"
        style={{
          background: "oklch(0 0 0 / 60%)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <div
        className="md:hidden fixed inset-y-0 left-0 z-[310] flex flex-col w-[280px] transition-transform duration-200"
        style={{
          background:  C.base,
          borderRight: `1px solid ${C.borderSubtle}`,
          boxShadow:   "4px 0 32px oklch(0 0 0 / 50%)",
          transform:   open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div className="h-[52px] px-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
          <Link to="/home" onClick={onClose}><Logo /></Link>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-xl"
            style={{ color: C.textTertiary }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <SidebarCtx.Provider value={false}>
          <nav className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-4">
            {creatorAccount && (
              <>
                <NavItem icon={Home}          label="Home"           to="/home"           exact onClick={onClose} />
                <NavDivider />
                <NavSection label="Marketplace">
                  <NavItem icon={Zap}           label="Opportunities"  to="/opportunities"        onClick={onClose} />
                  <NavItem icon={ClipboardList} label="Applications"   to="/applications"         onClick={onClose} />
                  <NavItem icon={FileText}      label="Contracts"      to="/contracts"            onClick={onClose} />
                  <NavItem icon={Mail}          label="Messages"       to="/messages"   badge={unreadCount} onClick={onClose} />
                </NavSection>
                <NavSection label="Workspace">
                  <NavItem icon={CalendarDays}  label="Calendar"       to="/content-planner"      onClick={onClose} />
                  <NavItem icon={TrendingUp}    label="Growth"         to="/growth"               onClick={onClose} />
                  <NavItem icon={Wand2}         label="Studio"         to="/create"               onClick={onClose} />
                  <NavItem icon={Layers}        label="Projects"       to="/projects"             onClick={onClose} />
                </NavSection>
                <NavSection label="Intelligence">
                  <NavItem icon={Sparkles}      label="AI Strategist"  to="/chat"       exact variant="ai" onClick={onClose} />
                  <NavItem icon={BarChart2}     label="Analytics"      to="/analytics"  exact      onClick={onClose} />
                  <NavItem icon={Globe}         label="Globe"          to="/globe"                onClick={onClose} />
                </NavSection>
              </>
            )}
            {businessAccount && (
              <>
                <NavItem icon={Home}          label="Home"           to="/home"           exact onClick={onClose} />
                <NavDivider />
                <NavSection label="Campaigns">
                  <NavItem icon={Megaphone}     label="Campaigns"      to="/campaigns"            onClick={onClose} />
                  <NavItem icon={Briefcase}     label="Pipeline"       to="/pipeline"             onClick={onClose} />
                  <NavItem icon={Users}         label="Find Creators"  to="/find-creators"        onClick={onClose} />
                  <NavItem icon={FileText}      label="Contracts"      to="/contracts"            onClick={onClose} />
                  <NavItem icon={Mail}          label="Messages"       to="/messages"   badge={unreadCount} onClick={onClose} />
                </NavSection>
                <NavSection label="Workspace">
                  <NavItem icon={Layers}        label="Projects"       to="/projects"             onClick={onClose} />
                  <NavItem icon={CalendarDays}  label="Calendar"       to="/content-planner"      onClick={onClose} />
                  <NavItem icon={Wand2}         label="Studio"         to="/create"               onClick={onClose} />
                </NavSection>
                <NavSection label="Intelligence">
                  <NavItem icon={Sparkles}      label="AI Strategist"  to="/chat"       exact variant="ai" onClick={onClose} />
                  <NavItem icon={Compass}       label="Marketing Hub"  to="/marketing-hub"        onClick={onClose} />
                  <NavItem icon={Globe}         label="Globe"          to="/globe"                onClick={onClose} />
                </NavSection>
              </>
            )}
            {!creatorAccount && !businessAccount && (
              <>
                <NavItem icon={Home}     label="Home"          to="/home" exact onClick={onClose} />
                <NavSection label="Intelligence">
                  <NavItem icon={Sparkles} label="AI Strategist" to="/chat" exact variant="ai" onClick={onClose} />
                </NavSection>
              </>
            )}
          </nav>
        </SidebarCtx.Provider>

        <div className="shrink-0 px-3 pb-4 pt-2" style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
          <Link to="/profile" onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 w-full transition-all duration-100 mb-1"
            style={{ color: C.textTertiary }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)";
              (e.currentTarget as HTMLElement).style.color      = C.textSecondary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "";
              (e.currentTarget as HTMLElement).style.color      = C.textTertiary;
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-[26px] w-[26px] rounded-full flex-none object-cover shrink-0" />
            ) : (
              <div className="h-[26px] w-[26px] rounded-full flex-none flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: avatarBg(displayName), color: "oklch(0.08 0 0)" }}>
                {displayName[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate leading-tight" style={{ color: C.textSecondary }}>
                {displayName}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-1 px-2.5">
            <Link to="/notifications" onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors relative"
              title="Notifications"
              style={{ color: notifCount > 0 ? C.accent : C.textMuted }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              <Bell className="h-3.5 w-3.5" />
              {notifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-[5px] w-[5px] rounded-full" style={{ background: C.accent }} />
              )}
            </Link>
            <Link to="/settings" onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
              title="Settings"
              style={{ color: C.textMuted }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)"; (e.currentTarget as HTMLElement).style.color = C.textTertiary; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="h-8 px-2 flex items-center justify-center rounded-md text-[11px] font-semibold transition-colors"
              style={{ color: C.textMuted }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.aiBlue; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
            >
              {lang === "en" ? "ع" : "EN"}
            </button>
            <button onClick={onSignOut}
              className="ml-auto h-8 flex items-center gap-2 rounded-lg px-2 text-[12px] font-medium transition-all duration-100"
              style={{ color: C.textMuted }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color      = "oklch(0.70 0.18 25)";
                (e.currentTarget as HTMLElement).style.background = "oklch(0.65 0.18 25 / 8%)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color      = C.textMuted;
                (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Mobile bottom navigation ─────────────────────────────────────────────────

function MobileBottomNav({
  creatorAccount, businessAccount, unreadCount,
}: {
  creatorAccount: boolean; businessAccount: boolean; unreadCount: number;
}) {
  const routerState = useRouterState();
  const pathname    = routerState.location.pathname;

  function isActive(to: string, exact = false) {
    return exact ? pathname === to : pathname === to || pathname.startsWith(to + "/") || (to !== "/" && pathname.startsWith(to));
  }

  function Tab({ icon: Icon, label, to, exact = false, badge, isAI = false }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string; to: string; exact?: boolean; badge?: number; isAI?: boolean;
  }) {
    const active = isActive(to, exact);
    return (
      <Link to={to as "/"} onTouchStart={() => preloadRoute(to)} className="flex-1 flex flex-col items-center justify-center gap-[3px] py-2 relative" style={{ minWidth: 0 }}>
        <div className="relative">
          {isAI ? (
            <div style={{
              width: 44, height: 28, borderRadius: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: active ? C.aiBlue : "oklch(1 0 0 / 8%)",
              border: active ? "none" : "1px solid oklch(1 0 0 / 10%)",
              transition: "all 0.18s",
            }}>
              <span style={{ color: active ? "#000" : "oklch(1 0 0 / 45%)", display: "flex" }}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
          ) : (
            <span style={{ color: active ? C.textPrimary : "oklch(1 0 0 / 30%)", display: "flex" }}>
              <Icon className="h-5 w-5" />
            </span>
          )}
          {badge != null && badge > 0 && (
            <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold"
              style={{ background: C.accent, color: "#000" }}>
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </div>
        <span style={{ fontSize: 9.5, color: active && !isAI ? C.textPrimary : "oklch(1 0 0 / 28%)", fontWeight: active ? 600 : 400 }}>
          {label}
        </span>
      </Link>
    );
  }

  return (
    <div className="md:hidden shrink-0" style={{
      background: "oklch(0.04 0 0 / 90%)", backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)", borderTop: "1px solid oklch(1 0 0 / 8%)",
      paddingBottom: "env(safe-area-inset-bottom, 10px)",
    }}>
      <div className="flex items-stretch" style={{ minHeight: 52 }}>
        <Tab icon={Home} label="Home" to="/home" exact />
        {creatorAccount  && <Tab icon={Zap}      label="Explore"   to="/opportunities" />}
        {businessAccount && <Tab icon={Megaphone} label="Campaigns" to="/campaigns" />}
        {!creatorAccount && !businessAccount && <Tab icon={Layers} label="Projects" to="/projects" />}
        <Tab icon={Sparkles} label="AI" to="/chat" exact isAI />
        <Tab icon={Mail} label="Messages" to="/messages" badge={unreadCount} />
      </div>
    </div>
  );
}

// ─── Notification helpers ─────────────────────────────────────────────────────

function notifIcon(type: string) {
  const sz = "h-3.5 w-3.5";
  if (type === "new_message")          return <MessageSquare className={sz} style={{ color: C.aiBlue }} />;
  if (type === "new_applicant")        return <UserPlus      className={sz} style={{ color: C.aiBlue }} />;
  if (type === "shortlisted")          return <Star          className={sz} style={{ color: C.aiBlue }} />;
  if (type === "accepted")             return <ThumbsUp      className={sz} style={{ color: "oklch(0.62 0.12 158)" }} />;
  if (type === "rejected")             return <ThumbsDown    className={sz} style={{ color: "oklch(0.52 0.15 24)" }} />;
  if (type === "saved_to_project")     return <Bookmark      className={sz} style={{ color: "oklch(0.70 0.08 68)" }} />;
  if (type === "verified")             return <ShieldCheck   className={sz} style={{ color: C.aiBlue }} />;
  if (type === "contract_sent")        return <FileText      className={sz} style={{ color: "oklch(0.70 0.08 68)" }} />;
  if (type === "deliverable_approved") return <ThumbsUp      className={sz} style={{ color: "oklch(0.62 0.12 158)" }} />;
  if (type === "revision_requested")   return <RotateCcw     className={sz} style={{ color: "oklch(0.70 0.08 68)" }} />;
  return                                      <AlertCircle   className={sz} style={{ color: C.textMuted }} />;
}

function relativeTime(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut }   = useAuth();
  const { t, lang, setLang, isRTL } = useI18n();
  const navigate            = useNavigate();
  const router              = useRouter();

  const [profile,    setProfile]    = useState<ShellProfile | null>(null);
  const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifCount,  setNotifCount]  = useState(0);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [notifItems,  setNotifItems]  = useState<AppNotification[]>([]);
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [collapsed,   setCollapsed]   = useState(() =>
    localStorage.getItem("mrkt_sidebar_collapsed") === "true"
  );

  const notifRef  = useRef<HTMLDivElement>(null);
  const routerState = useRouterState();
  const pathname  = routerState.location.pathname;

  // ── Preloader setup ────────────────────────────────────────────────────────
  useEffect(() => {
    // Wire the module-level preload function to this router instance so nav
    // components can call preloadRoute(to) without needing useRouter().
    setPreloadFn((to) => {
      router.preloadRoute({ to: to as "/" }).catch(() => {});
    });
  }, [router]);

  // ── Profile ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name,account_type,onboarding_path")
      .eq("id", user.id)
      .single()
      .then(({ data: p }) => {
        setProfile(p as ShellProfile ?? null);
        const creator = p?.onboarding_path === "creator" || p?.account_type === "creator";
        const biz     = p?.account_type === "brand" || p?.account_type === "business" ||
          p?.onboarding_path === "business_creator" || p?.onboarding_path === "business_marketing";

        const role = creator ? "creator" : biz ? "business" : null;

        // Kick off background preloading once we know the user's role.
        // This downloads all route JS chunks so navigation is instant.
        if (user) runAppPreloader(user.id, role);

        if (creator) {
          supabase
            .from("creator_profiles").select("profile_image_url").eq("user_id", user.id).maybeSingle()
            .then(({ data: cp }: { data: { profile_image_url: string | null } | null }) => {
              if (cp?.profile_image_url) setAvatarUrl(cp.profile_image_url);
            });
        } else if (biz) {
          supabase
            .from("business_profiles").select("logo_url").eq("user_id", user.id).maybeSingle()
            .then(({ data: bp }: { data: { logo_url: string | null } | null }) => {
              if (bp?.logo_url) setAvatarUrl(bp.logo_url);
            });
        }
      });
  }, [user]);

  // ── Counts ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    fetchUnreadCount(user.id).then(setUnreadCount).catch(() => {});
  }, [user, pathname]);

  useEffect(() => {
    if (!user) return;
    fetchUnreadNotificationCount(user.id).then(setNotifCount).catch(() => {});
  }, [user, pathname]);

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("shell-notif")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchUnreadNotificationCount(user.id).then(setNotifCount).catch(() => {});
        if (notifOpen) fetchNotifications(user.id).then(setNotifItems).catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, notifOpen]);

  // ── Click-outside: close notif panel ──────────────────────────────────────
  useEffect(() => {
    if (!notifOpen) return;
    function handle(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setNotifOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [notifOpen]);

  // ── Avatar hot-reload ──────────────────────────────────────────────────────
  useEffect(() => {
    function onAvatarUpdated(e: Event) {
      const url = (e as CustomEvent<{ url: string }>).detail?.url;
      if (url) setAvatarUrl(url);
    }
    window.addEventListener("mrkt:avatar-updated", onAvatarUpdated);
    return () => window.removeEventListener("mrkt:avatar-updated", onAvatarUpdated);
  }, []);

  // ── Zero badge when notifications page viewed ──────────────────────────────
  useEffect(() => {
    function onRead() { setNotifCount(0); }
    window.addEventListener("mrkt:notifications-read", onRead);
    return () => window.removeEventListener("mrkt:notifications-read", onRead);
  }, []);

  // ── Close drawer on route change ───────────────────────────────────────────
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  async function openNotifications() {
    if (!user) return;
    setNotifOpen((v) => !v);
    if (!notifOpen) {
      const items = await fetchNotifications(user.id);
      setNotifItems(items);
    }
  }

  async function handleNotifClick(n: AppNotification) {
    await markNotificationRead(n.id);
    setNotifItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
    setNotifCount((c) => Math.max(0, c - (n.read ? 0 : 1)));
    setNotifOpen(false);
    if (n.link) navigate({ to: n.link as "/" });
  }

  async function handleMarkAllRead() {
    if (!user) return;
    await markAllNotificationsRead(user.id);
    setNotifItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setNotifCount(0);
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("mrkt_sidebar_collapsed", String(next));
  }

  const creatorAccount  = isCreator(profile);
  const businessAccount = isBusiness(profile);
  const displayName     = profile?.name ?? user?.email?.split("@")[0] ?? "Account";
  const initial         = displayName[0]?.toUpperCase() ?? "M";
  const displayNotifCount = pathname === "/notifications" ? 0 : notifCount;

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden" style={{ background: C.canvas }}>

      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <MobileTopBar onMenu={() => setDrawerOpen(true)} />

      {/* ── Desktop sidebar ────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-none flex-col"
        style={{
          width:       collapsed ? 56 : 220,
          transition:  "width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow:    "hidden",
          background:  C.base,
          borderRight: isRTL ? "none" : `1px solid ${C.borderSubtle}`,
          borderLeft:  isRTL ? `1px solid ${C.borderSubtle}` : "none",
          boxShadow:   "1px 0 0 oklch(1 0 0 / 4%)",
          order: isRTL ? 1 : 0,
        }}
      >
        <SidebarCtx.Provider value={collapsed}>

          {/* Logo + collapse toggle */}
          <div
            className="h-[56px] shrink-0 flex items-center"
            style={{
              padding: collapsed ? "0 10px" : "0 14px 0 16px",
              justifyContent: collapsed ? "center" : "space-between",
              borderBottom: `1px solid ${C.borderSubtle}`,
            }}
          >
            {!collapsed && <Link to="/home"><Logo /></Link>}
            <button
              type="button"
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="h-7 w-7 flex items-center justify-center rounded-lg transition-all duration-100 shrink-0"
              style={{ color: C.textMuted }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)";
                (e.currentTarget as HTMLElement).style.color      = C.textTertiary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color      = C.textMuted;
              }}
            >
              {collapsed
                ? <ChevronRight className="h-3.5 w-3.5" />
                : <ChevronLeft  className="h-3.5 w-3.5" />
              }
            </button>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 overflow-y-auto min-h-0 px-2 py-2 ${collapsed ? "space-y-0.5" : "space-y-2"}`}>

            {/* ── Creator ─────────────────────────────────────────────── */}
            {creatorAccount && (
              <>
                <NavItem icon={Home}          label={t("nav.home")}           to="/home"           exact />
                <NavSection label="Marketplace">
                  <NavItem icon={Zap}           label={t("nav.opportunities")}  to="/opportunities"       />
                  <NavItem icon={ClipboardList} label={t("nav.applications")}   to="/applications"        />
                  <NavItem icon={FileText}      label="Contracts"               to="/contracts"           />
                  <NavItem icon={Mail}          label={t("nav.messages")}       to="/messages"  badge={unreadCount} />
                </NavSection>
                <NavSection label="Workspace">
                  <NavItem icon={CalendarDays}  label={t("nav.planner")}        to="/content-planner"     />
                  <NavItem icon={TrendingUp}    label={t("nav.growth")}         to="/growth"              />
                  <NavItem icon={Wand2}         label={t("nav.studio")}         to="/create"              />
                  <NavItem icon={Layers}        label={t("nav.projects")}       to="/projects"            />
                </NavSection>
                <NavSection label="Intelligence">
                  <NavItem icon={Sparkles}      label={t("nav.ai_strategist")}  to="/chat"      exact variant="ai" />
                  <NavItem icon={BarChart2}     label={t("nav.analytics")}      to="/analytics" exact     />
                  <NavItem icon={Globe}         label={t("nav.globe")}          to="/globe"               />
                </NavSection>
              </>
            )}

            {/* ── Business ────────────────────────────────────────────── */}
            {businessAccount && (
              <>
                <NavItem icon={Home}          label={t("nav.home")}           to="/home"           exact />
                <NavSection label="Campaigns">
                  <NavItem icon={Megaphone}     label={t("nav.campaigns")}      to="/campaigns"           />
                  <NavItem icon={Briefcase}     label={t("nav.pipeline")}       to="/pipeline"            />
                  <NavItem icon={Users}         label={t("nav.find_creators")}  to="/find-creators"       />
                  <NavItem icon={FileText}      label="Contracts"               to="/contracts"           />
                  <NavItem icon={Mail}          label={t("nav.messages")}       to="/messages"  badge={unreadCount} />
                </NavSection>
                <NavSection label="Workspace">
                  <NavItem icon={Layers}        label={t("nav.projects")}       to="/projects"            />
                  <NavItem icon={CalendarDays}  label={t("nav.planner")}        to="/content-planner"     />
                  <NavItem icon={Wand2}         label={t("nav.studio")}         to="/create"              />
                </NavSection>
                <NavSection label="Intelligence">
                  <NavItem icon={Sparkles}      label={t("nav.ai_strategist")}  to="/chat"      exact variant="ai" />
                  <NavItem icon={Compass}       label="Marketing Hub"           to="/marketing-hub"       />
                  <NavItem icon={Globe}         label={t("nav.globe")}          to="/globe"               />
                </NavSection>
              </>
            )}

            {/* ── Fallback ────────────────────────────────────────────── */}
            {!creatorAccount && !businessAccount && (
              <>
                <NavItem icon={Home}     label="Home"          to="/home" exact />
                <NavSection label="Intelligence">
                  <NavItem icon={Sparkles} label="AI Strategist" to="/chat" exact variant="ai" />
                </NavSection>
              </>
            )}
          </nav>

          {/* User footer */}
          <div
            className="shrink-0 px-3 pb-2 pt-1.5"
            style={{ borderTop: `1px solid ${C.borderSubtle}` }}
          >
            {collapsed ? (
              /* Collapsed — compact icon stack */
              <div className="flex flex-col items-center gap-1 py-1">
                <Link to="/profile" title={displayName}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-6 w-6 rounded-full object-cover"
                      style={{ boxShadow: "0 0 0 1.5px oklch(1 0 0 / 14%)" }} />
                  ) : (
                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: avatarBg(displayName), color: "oklch(0.08 0 0)" }}>
                      {initial}
                    </div>
                  )}
                </Link>
                <button onClick={openNotifications} title="Notifications"
                  className="h-6 w-6 flex items-center justify-center rounded-lg transition-colors relative"
                  style={{ color: displayNotifCount > 0 ? C.accent : C.textMuted }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                  <Bell className="h-3 w-3" />
                  {displayNotifCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 h-[5px] w-[5px] rounded-full"
                      style={{ background: C.accent }} />
                  )}
                </button>
                <Link to="/settings" title="Settings"
                  className="h-6 w-6 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: C.textMuted }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)"; (e.currentTarget as HTMLElement).style.color = C.textTertiary; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = C.textMuted; }}>
                  <Settings className="h-3 w-3" />
                </Link>
                <button onClick={() => setLang(lang === "en" ? "ar" : "en")} title={lang === "en" ? "Switch to Arabic" : "Switch to English"}
                  className="h-6 w-6 flex items-center justify-center rounded-lg text-[9px] font-bold transition-colors"
                  style={{ color: C.textMuted }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.aiBlue; (e.currentTarget as HTMLElement).style.background = "oklch(0.72 0.10 224 / 8%)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textMuted; (e.currentTarget as HTMLElement).style.background = ""; }}>
                  {lang === "en" ? "ع" : "EN"}
                </button>
                <button onClick={async () => { resetPreloader(); await signOut(); window.location.href = "/login"; }} title="Sign out"
                  className="h-6 w-6 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: C.textMuted }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(0.70 0.18 25)"; (e.currentTarget as HTMLElement).style.background = "oklch(0.65 0.18 25 / 8%)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textMuted; (e.currentTarget as HTMLElement).style.background = ""; }}>
                  <LogOut className="h-3 w-3" />
                </button>
              </div>
            ) : (
              /* Expanded — profile card + icon buttons */
              <div className="space-y-1">
                <Link
                  to="/profile"
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 w-full transition-all duration-100"
                  style={{ color: C.textTertiary }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)";
                    (e.currentTarget as HTMLElement).style.color      = C.textSecondary;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "";
                    (e.currentTarget as HTMLElement).style.color      = C.textTertiary;
                  }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-[26px] w-[26px] rounded-full flex-none object-cover shrink-0" />
                  ) : (
                    <div className="h-[26px] w-[26px] rounded-full flex-none flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: avatarBg(displayName), color: "oklch(0.08 0 0)" }}>
                      {initial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate leading-tight" style={{ color: C.textSecondary }}>
                      {displayName}
                    </div>
                  </div>
                </Link>

                <div className="flex items-center gap-1 px-1">
                  {/* Notifications bell */}
                  <button
                    onClick={openNotifications}
                    className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors relative"
                    title="Notifications"
                    style={{ color: displayNotifCount > 0 ? C.accent : C.textMuted }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <Bell className="h-3.5 w-3.5" />
                    {displayNotifCount > 0 && (
                      <span className="absolute top-1 right-1 h-[5px] w-[5px] rounded-full"
                        style={{ background: C.accent }} />
                    )}
                  </button>

                  {/* Settings */}
                  <Link
                    to="/settings"
                    className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors"
                    title="Settings"
                    style={{ color: C.textMuted }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)"; (e.currentTarget as HTMLElement).style.color = C.textTertiary; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Link>

                  {/* Language toggle */}
                  <button
                    onClick={() => setLang(lang === "en" ? "ar" : "en")}
                    className="h-7 px-2 flex items-center justify-center rounded-lg text-[10px] font-semibold transition-colors"
                    title={lang === "en" ? "Switch to Arabic" : "Switch to English"}
                    style={{ color: C.textMuted }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.aiBlue; (e.currentTarget as HTMLElement).style.background = "oklch(0.72 0.10 224 / 8%)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textMuted; (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    {lang === "en" ? "ع" : "EN"}
                  </button>

                  {/* Sign out */}
                  <button
                    onClick={async () => { resetPreloader(); await signOut(); window.location.href = "/login"; }}
                    className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors ml-auto"
                    title="Sign out"
                    style={{ color: C.textMuted }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color      = "oklch(0.70 0.18 25)";
                      (e.currentTarget as HTMLElement).style.background = "oklch(0.65 0.18 25 / 8%)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color      = C.textMuted;
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

        </SidebarCtx.Provider>
      </aside>

      {/* ── Main content area ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col overflow-y-auto">
          {children}
        </div>
        <MobileBottomNav
          creatorAccount={creatorAccount}
          businessAccount={businessAccount}
          unreadCount={unreadCount}
        />
      </div>

      {/* ── Mobile drawer ───────────────────────────────────────────────── */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        creatorAccount={creatorAccount}
        businessAccount={businessAccount}
        displayName={displayName}
        avatarUrl={avatarUrl}
        unreadCount={unreadCount}
        notifCount={displayNotifCount}
        onSignOut={async () => { resetPreloader(); await signOut(); window.location.href = "/login"; }}
        lang={lang}
        setLang={setLang}
      />

      {/* ── Notification panel ──────────────────────────────────────────── */}
      {notifOpen && (
        <div
          ref={notifRef}
          className="hidden md:flex flex-col"
          style={{
            position:    "fixed",
            left:        isRTL ? "auto" : (collapsed ? 62 : 226),
            right:       isRTL ? (collapsed ? 62 : 226) : "auto",
            bottom:      44,
            width:       340,
            maxHeight:   "min(480px, calc(100vh - 80px))",
            background:  "oklch(0.07 0 0)",
            border:      `1px solid oklch(1 0 0 / 10%)`,
            borderRadius: 16,
            boxShadow:   "0 12px 48px oklch(0 0 0 / 70%)",
            backdropFilter: "blur(20px)",
            zIndex:      200, overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: `1px solid oklch(1 0 0 / 8%)` }}>
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5" style={{ color: C.accent }} />
              <span className="text-[13px] font-semibold" style={{ color: C.textPrimary }}>Notifications</span>
              {notifCount > 0 && (
                <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[17px] text-center"
                  style={{ background: C.accent, color: "#000" }}>
                  {notifCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {notifCount > 0 && (
                <button onClick={handleMarkAllRead} title="Mark all read"
                  className="h-6 w-6 flex items-center justify-center rounded-md transition-colors"
                  style={{ color: C.accent }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 8%)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                  <CheckCheck className="h-3 w-3" />
                </button>
              )}
              <button onClick={() => setNotifOpen(false)}
                className="h-6 w-6 flex items-center justify-center rounded-md transition-colors"
                style={{ color: C.textMuted }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 6%)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {notifItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Bell className="h-6 w-6 mb-2" style={{ color: C.textMuted }} />
                <p className="text-[12px]" style={{ color: C.textMuted }}>No notifications yet</p>
              </div>
            ) : (
              notifItems.map((n) => (
                <button key={n.id} onClick={() => handleNotifClick(n)}
                  className="w-full text-left flex items-start gap-3 px-4 py-3 transition-colors"
                  style={{ borderBottom: `1px solid oklch(1 0 0 / 5%)` }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 4%)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  <div className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center mt-0.5"
                    style={{ background: "oklch(1 0 0 / 6%)" }}>
                    {notifIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] leading-snug"
                      style={{ color: n.read ? C.textTertiary : C.textPrimary, fontWeight: n.read ? 400 : 500 }}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-[11px] mt-0.5 truncate" style={{ color: C.textMuted }}>{n.body}</p>}
                    <p className="text-[10px] mt-1" style={{ color: C.textMuted }}>{relativeTime(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <div className="shrink-0 h-2 w-2 rounded-full mt-2" style={{ background: C.accent }} />
                  )}
                </button>
              ))
            )}
          </div>

          {/* View all */}
          <div className="shrink-0" style={{ borderTop: `1px solid oklch(1 0 0 / 8%)` }}>
            <Link to="/notifications" onClick={() => setNotifOpen(false)}
              className="flex items-center justify-center py-2.5 text-[11.5px] font-medium transition-colors"
              style={{ color: C.textTertiary }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.textPrimary; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textTertiary; }}>
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
