import { useState } from "react";
import { Logo } from "./Logo";
import { I } from "./Icons";
import { TENANTS, ROLES } from "../data/mock";

export type NavItem = { id: string; label: string; icon: keyof typeof I; badge?: string; group?: string };

type SidebarProps = {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  onExit: () => void;
  roleLabel: string;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function Sidebar({ items, active, onSelect, onExit, roleLabel, collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  // group items
  const groups: { name: string; items: NavItem[] }[] = [];
  items.forEach((it) => {
    const g = it.group || "Main";
    let bucket = groups.find((x) => x.name === g);
    if (!bucket) { bucket = { name: g, items: [] }; groups.push(bucket); }
    bucket.items.push(it);
  });

  const content = (isMobile: boolean) => (
    <>
      <div className={`px-4 py-4 border-b border-white/10 flex items-center ${collapsed && !isMobile ? "justify-center" : "justify-between"}`}>
        {collapsed && !isMobile ? (
          <Logo variant="mark" size={36} />
        ) : (
          <Logo variant="full" size={38} className="[&_div]:!text-white" />
        )}
        {!isMobile && !collapsed && (
          <button onClick={onToggle} className="text-white/60 hover:text-white p-1 rounded hover:bg-white/10" title="Collapse">
            <I.chevronR size={16} className="rotate-180" />
          </button>
        )}
        {isMobile && (
          <button onClick={onMobileClose} className="text-white/70 hover:text-white p-2 rounded hover:bg-white/10">✕</button>
        )}
      </div>

      {!collapsed || isMobile ? (
        <div className="px-4 pt-3 pb-1 text-[10px] tracking-[0.22em] text-white/50">
          {roleLabel.toUpperCase()}
        </div>
      ) : null}

      <nav className="px-2 pb-4 flex-1 overflow-y-auto">
        {groups.map((g, gi) => (
          <div key={g.name} className={gi > 0 ? "mt-3" : ""}>
            {(!collapsed || isMobile) && g.name !== "Main" && (
              <div className="px-3 pt-2 pb-1 text-[9px] tracking-[0.25em] text-white/35">{g.name.toUpperCase()}</div>
            )}
            {g.items.map((it) => {
              const Icon = I[it.icon];
              const isActive = active === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => { onSelect(it.id); onMobileClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition mb-0.5 ${
                    isActive ? "bg-gold-500 text-navy-900 font-semibold shadow" : "text-white/80 hover:bg-white/10 hover:text-white"
                  } ${collapsed && !isMobile ? "justify-center" : ""}`}
                  title={collapsed && !isMobile ? it.label : undefined}
                >
                  <Icon size={18} stroke={isActive ? "#0B1D3A" : "currentColor"} />
                  {(!collapsed || isMobile) && <span className="flex-1 text-left truncate">{it.label}</span>}
                  {(!collapsed || isMobile) && it.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${isActive ? "bg-navy-900 text-gold-300" : "bg-white/15 text-white/80"}`}>
                      {it.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/10 space-y-1">
        {(!collapsed || isMobile) && (
          <div className="px-2 py-1 text-[10px] text-white/40">
            <div>Build 2026.4 · Hive Runtime v2</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-soft" />
              <span>All systems nominal</span>
            </div>
          </div>
        )}
        <button
          onClick={onExit}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white ${collapsed && !isMobile ? "justify-center" : ""}`}
          title={collapsed && !isMobile ? "Sign out" : undefined}
        >
          <I.logout size={18} />
          {(!collapsed || isMobile) && <span>Sign out</span>}
        </button>
        {collapsed && !isMobile && (
          <button onClick={onToggle} className="w-full p-2 rounded hover:bg-white/10 text-white/60 flex justify-center" title="Expand">
            <I.chevronR size={14} />
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop / tablet sidebar — always visible from sm up */}
      <aside
        className={`hidden sm:flex shrink-0 flex-col bg-navy-800 text-white min-h-screen sticky top-0 h-screen transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {content(false)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-navy-900/60" onClick={onMobileClose} />
          <aside className="relative w-72 max-w-[80%] bg-navy-800 text-white flex flex-col slidein">
            {content(true)}
          </aside>
        </div>
      )}
    </>
  );
}

type TopBarProps = {
  user: { name: string; role: string; avatar?: string };
  tenantId: string;
  onTenantChange: (id: string) => void;
  onOpenAI: () => void;
  onOpenMobileMenu: () => void;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
};

export function TopBar({ user, tenantId, onTenantChange, onOpenAI, onOpenMobileMenu, onOpenNotifications, onOpenProfile }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const tenant = TENANTS.find((t) => t.id === tenantId) || TENANTS[0];
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="flex items-center gap-2 lg:gap-3 px-3 lg:px-6 h-16">
        {/* Mobile hamburger */}
        <button onClick={onOpenMobileMenu} className="sm:hidden p-2 rounded hover:bg-slate-100" title="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>

        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg border border-slate-200 hover:border-navy-300 transition max-w-[60vw]"
          >
            <I.building size={16} stroke="#0B1D3A" />
            <div className="text-left min-w-0">
              <div className="text-[10px] text-slate-500 leading-none">ACTIVE TENANT</div>
              <div className="text-sm font-semibold text-navy-800 leading-tight truncate">{tenant.name}</div>
            </div>
            <I.chevronD size={14} />
          </button>
          {open && (
            <div className="absolute top-12 left-0 w-80 max-w-[90vw] card p-2 z-40 slidein">
              <div className="px-3 py-2 text-[10px] tracking-widest text-slate-500">SWITCH TENANT</div>
              {TENANTS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onTenantChange(t.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 hover:bg-slate-50 ${t.id === tenantId ? "bg-navy-50" : ""}`}
                >
                  <span className="w-2 h-8 rounded" style={{ background: t.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-navy-800 truncate">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{t.city} · {t.type} · {t.beds} beds</div>
                  </div>
                  {t.id === tenantId && <I.check size={16} stroke="#0B5345" />}
                </button>
              ))}
              <div className="mt-2 px-3 py-2 text-[10px] text-slate-400 border-t border-slate-100">
                Strict tenant isolation enforced. Switch logged in audit trail.
              </div>
            </div>
          )}
        </div>

        <div className="hidden md:flex flex-1 max-w-xl items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
          <I.search size={16} stroke="#64748b" />
          <input className="bg-transparent flex-1 outline-none text-sm" placeholder="Search patients, MRN, orders, claims, documents…" />
          <kbd className="text-[10px] text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">⌘K</kbd>
        </div>

        <div className="flex-1 md:hidden" />

        <button onClick={onOpenAI} className="flex items-center gap-2 px-2 lg:px-3 py-2 rounded-lg bg-navy-800 text-white text-sm hover:bg-navy-700">
          <I.brain size={16} />
          <span className="hidden lg:inline">AI Co-Pilot</span>
        </button>

        <button onClick={onOpenNotifications} className="relative p-2 rounded-lg hover:bg-slate-100" title="Notifications">
          <I.bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
        </button>

        <button onClick={onOpenProfile} className="flex items-center gap-2 lg:gap-3 pl-2 lg:pl-3 lg:border-l border-slate-200 hover:opacity-80 transition" title="My profile">
          <div className="text-right hidden lg:block">
            <div className="text-sm font-semibold text-navy-800">{user.name}</div>
            <div className="text-[11px] text-slate-500">{user.role}</div>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-navy-700 to-navy-900 text-white flex items-center justify-center text-sm font-semibold ring-2 ring-gold-400/40">
            {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </div>
        </button>
      </div>
    </header>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl text-navy-800">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1 text-sm">{subtitle}</p>}
        <div className="gold-divider w-16 mt-3" />
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const r = ROLES.find((x) => x.id === role);
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gold-50 text-gold-800 text-[11px] font-semibold border border-gold-200">
      <span className="w-1.5 h-1.5 rounded-full bg-gold-500" /> {r?.label}
    </span>
  );
}
