import { CapabilityDirectory, type CapabilityDirectoryItem } from "@/components/capability-directory";
import { Denied, Panel } from "@/components/brand";
import { can } from "@/lib/authz";
import { requirePrincipal } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * Shared Audit & Events entry point. Audit and events retain separate read
 * permissions and separate append-only stores; this route is only a governed
 * directory over those existing implementations.
 */
export default async function AuditEventsPage() {
  const principal = await requirePrincipal();
  const audit = can(principal, "audit:log.read");
  const events = can(principal, "audit:event.read");

  if (!audit.allowed && !events.allowed) {
    return (
      <Denied
        reason="Neither audit-ledger nor enterprise-event read access is active for this principal."
        capability="audit:log.read OR audit:event.read"
      />
    );
  }

  const items: CapabilityDirectoryItem[] = [
    ...(audit.allowed
      ? [
          {
            href: "/os/audit",
            name: "Audit Ledger",
            description:
              "Inspect immutable action history, chain integrity and accountable AI decision records in scope.",
            icon: "audit" as const,
          },
        ]
      : []),
    ...(events.allowed
      ? [
          {
            href: "/os/events",
            name: "Enterprise Event Stream",
            description:
              "Inspect versioned, hash-chained domain and governance events carried across governed OS boundaries.",
            icon: "events" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Shared capability · audit &amp; events</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Accountability and event history</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Audit records who did what under which authority. Events carry immutable domain facts between
          operating systems. They remain distinct append-only implementations and are never writable from
          this frontend.
        </p>
      </header>

      <Panel kicker="Security boundary" title="Two ledgers, two explicit grants">
        <dl className="grid gap-3 text-[12px] sm:grid-cols-2">
          <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-3">
            <dt className="font-mono text-[11px] text-[#8a6d10]">audit:log.read</dt>
            <dd className="mt-1 beyu-muted">
              {audit.allowed ? "Granted for this session; Audit Ledger is available below." : "Not granted; audit records were not read."}
            </dd>
          </div>
          <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-3">
            <dt className="font-mono text-[11px] text-[#8a6d10]">audit:event.read</dt>
            <dd className="mt-1 beyu-muted">
              {events.allowed ? "Granted for this session; Event Stream is available below." : "Not granted; enterprise events were not read."}
            </dd>
          </div>
        </dl>
      </Panel>

      <CapabilityDirectory
        items={items}
        emptyMessage="No audit or event destination is within your current grants."
      />
    </div>
  );
}
