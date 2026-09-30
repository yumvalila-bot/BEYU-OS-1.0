import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Metric, Panel } from "@/components/brand";
import Link from "next/link";
import { db } from "@/db";
import {
  communicationChannels,
  communicationProviders,
  communicationContacts,
  communicationConversations,
  communicationMessages,
  communicationTemplates,
  communicationSecurityEvents,
} from "@/db/schema";
import { eq, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Communications — world-class governed communications platform.
 *
 * ONE shared BEYU OS capability, NOT an OS: the governed communication layer
 * through which BEYU communicates with people, organizations, customers,
 * employees, families, tenants, entities and authorized external parties.
 *
 * Preserves GlobalUserID, RBAC/ABAC/RLS, audit/events, documents, workflow, Noelia.
 * CAP_POSTING remains LOCKED.
 */

const COMMUNICATION_LINKS = [
  { href: "/os/communications/overview", label: "Overview", desc: "Active conversations, messages, delivery, failures, handoffs, SLA" },
  { href: "/os/communications/channels", label: "Channels", desc: "WHATSAPP, SMS, EMAIL, IN_APP, INTERNAL — registry" },
  { href: "/os/communications/providers", label: "Providers", desc: "Provider registry, health, adapter status — SIMULATED by default" },
  { href: "/os/communications/conversations", label: "Conversations", desc: "Unified, omnichannel, governed conversation engine" },
  { href: "/os/communications/messages", label: "Messages", desc: "Canonical message model with delivery tracking" },
  { href: "/os/communications/contacts", label: "Contacts 360°", desc: "Recipient 360° with verified identity linking to GlobalUserID" },
  { href: "/os/communications/templates", label: "Templates", desc: "Versioned, localized, approved templates" },
  { href: "/os/communications/routing", label: "Routing", desc: "Intelligent channel selection, routing rules, SLA" },
  { href: "/os/communications/consent", label: "Consent & Preferences", desc: "Opt-in, opt-out, revocation, purpose, evidence" },
  { href: "/os/communications/cases", label: "Cases & Handoffs", desc: "Human handoff BOT→HUMAN→BOT, case/ticket bridge" },
  { href: "/os/communications/journeys", label: "Journeys", desc: "Communication journeys, workflow-triggered" },
  { href: "/os/communications/feedback", label: "Feedback", desc: "Feedback, surveys, ratings, AI analysis (preserves original)" },
  { href: "/os/communications/broadcasts", label: "Broadcasts", desc: "Governed bulk messaging with consent, approval, audit" },
  { href: "/os/communications/delivery", label: "Delivery", desc: "Delivery tracking, retries, failover, loop prevention" },
  { href: "/os/communications/analytics", label: "Analytics", desc: "Channel usage, delivery, response times, SLA compliance" },
  { href: "/os/communications/cost", label: "Cost Intelligence", desc: "Provider cost tracking — NOT accounting, visibility only" },
  { href: "/os/communications/security", label: "Security Center", desc: "Webhook signature failures, abnormal volume, anti-spam" },
  { href: "/os/notifications", label: "Notification Center", desc: "Governed in-app alert stream (existing)" },
];

export default async function CommunicationsPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const channels = await db.select().from(communicationChannels);
    const providers = await db.select({ count: count() }).from(communicationProviders);
    const contacts = await db.select({ count: count() }).from(communicationContacts).where(eq(communicationContacts.tenantId, principal.tenantId));
    const conversations = await db.select({ count: count() }).from(communicationConversations).where(eq(communicationConversations.tenantId, principal.tenantId));
    const messages = await db.select({ count: count() }).from(communicationMessages).where(eq(communicationMessages.tenantId, principal.tenantId));
    const templates = await db.select({ count: count() }).from(communicationTemplates);
    const securityEvents = await db.select({ count: count() }).from(communicationSecurityEvents).where(eq(communicationSecurityEvents.tenantId, principal.tenantId));

    const activeProviders = await db.select().from(communicationProviders);
    const connectedCount = activeProviders.filter((p) => ["CONNECTED", "VERIFIED"].includes(p.status)).length;
    const simulatedCount = activeProviders.filter((p) => p.status === "SIMULATED").length;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Shared Capability · Communications Platform</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Communications</h1>
          <p className="mt-1.5 max-w-4xl text-[13px] beyu-muted">
            World-class governed communications: WhatsApp, SMS, Email, In-App, Internal BEYU messaging,
            unified conversations, contact 360° with verified GlobalUserID linking, omnichannel continuity,
            orchestration, routing, templates, localization, consent, preferences, human handoff, cases/tickets,
            SLA/escalation, invoices, receipts, reports, documents, feedback, surveys, alerts, reminders,
            communication journeys, workflow-triggered communications, AI-assisted through Noelia/HIVE with human
            approval, delivery tracking, provider failover, reliability, analytics, cost intelligence, security
            monitoring, international/country-specific providers, accessibility, auditability, governance.
            <br />
            <br />
            <strong>Communications is NOT an OS</strong> — it is a shared BEYU OS capability. CAP_POSTING remains LOCKED.
            Provider secrets are env-var NAMES only — no secret column exists. Marketing requires consent.
            Webhooks verify signatures, enforce idempotency, and never trust tenant IDs from payloads.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Channels" value={String(channels.length)} sub={channels.map((c) => c.code).join(" · ")} />
          <Metric
            label="Providers"
            value={String(providers[0]?.count ?? 0)}
            sub={`${connectedCount} connected · ${simulatedCount} simulated`}
            tone={connectedCount > 0 ? "gold" : "navy"}
          />
          <Metric label="Contacts" value={String(contacts[0]?.count ?? 0)} sub="recipient 360° in tenant scope" />
          <Metric label="Conversations" value={String(conversations[0]?.count ?? 0)} sub="unified, omnichannel, governed" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Messages" value={String(messages[0]?.count ?? 0)} sub="canonical message model" />
          <Metric label="Templates" value={String(templates[0]?.count ?? 0)} sub="versioned, localized, approved" />
          <Metric label="Security Events" value={String(securityEvents[0]?.count ?? 0)} sub="failed signatures, abnormal volume" tone={(securityEvents[0]?.count ?? 0) > 0 ? "gold" : "navy"} />
          <Metric label="Provider Status" value={simulatedCount > 0 ? "SIMULATED" : "NOT_CONNECTED"} sub="no fake CONNECTED claims — truthful" tone="slate" />
        </div>

        <Panel kicker="Capability Map" title="Communications Platform — Governed Modules">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMMUNICATION_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-[color:var(--beyu-line)] p-4 transition hover:border-[#d4af37]/50 hover:bg-[#d4af37]/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">{link.label}</span>
                  <Badge tone="slate">{link.href.split("/").pop()?.toUpperCase()}</Badge>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed beyu-muted">{link.desc}</p>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel kicker="Architecture" title="Orchestration — Governed Flow">
          <div className="space-y-2 text-[12px] leading-relaxed">
            <div className="rounded bg-[#050f22] p-3 text-white font-mono text-[11px]">
              BEYU EVENT → COMMUNICATION INTENT → POLICY → AUTHORIZATION (RBAC/ABAC/RLS) → CONSENT CHECK (marketing requires OPT_IN) → RECIPIENT RESOLUTION (GlobalUserID verified linking) → ROUTING ENGINE (channel selection) → TEMPLATE ENGINE (versioned, localized) → PROVIDER (adapter, never hard-coded) → DELIVERY (QUEUED→SENDING→SENT→DELIVERED→READ) → AUDIT (hash-chained) + ANALYTICS + EVENT → FEEDBACK/CASE → HUMAN/NOELIA → RESOLUTION
            </div>
            <ul className="list-disc pl-5 space-y-1 beyu-muted">
              <li>WHO: principal resolved via session → GlobalUserID → tenant/entity/country/classification</li>
              <li>WITH WHOM: contact 360° with verified methods — phone/WhatsApp/email/in-app/internal are endpoints, not identities</li>
              <li>WHY: purpose (TRANSACTIONAL/OPERATIONAL/SECURITY/MARKETING) + event trigger</li>
              <li>WHAT: body, template, structured payload, document via canonical Documents (never duplicate storage)</li>
              <li>THROUGH WHICH CHANNEL: governed routing with fallback — Noelia may RECOMMEND, governance DECIDES</li>
              <li>UNDER WHICH AUTHORITY: tenant/entity/role/permission via can() + RLS</li>
              <li>UNDER WHICH CONSENT: consent check — marketing requires OPT_IN with evidence</li>
              <li>WITH WHAT CLASSIFICATION: classification ceiling enforced — HIGHLY_RESTRICTED cannot go over insecure SMS</li>
              <li>WHICH POLICY: routing rules, SLA, business hours, holidays, timezone</li>
              <li>WHAT HAPPENED: delivery tracking QUEUED→SENT→DELIVERED→READ→FAILED with provider events</li>
              <li>WHAT HAPPENS NEXT: journey automation, case escalation, SLA breach → supervisor</li>
              <li>WHO/WHAT ACTED: human/system/NOELIA_AI — Noelia cannot grant permissions, post journals, move money, bypass RLS</li>
              <li>CAN IT BE AUDITED: complete evidence trail via audit_log + enterprise_events (hash-chained, tamper-evident)</li>
            </ul>
          </div>
        </Panel>

        <Panel kicker="Providers" title="Provider Status — Truthful, No Fake Claims">
          <div className="space-y-2">
            {activeProviders.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[color:var(--beyu-line)] px-3 py-2 text-[12px]">
                <div className="flex items-center gap-2">
                  <Badge tone={p.status === "VERIFIED" ? "gold" : p.status === "SIMULATED" ? "slate" : p.status === "CONNECTED" ? "navy" : "slate"}>{p.status}</Badge>
                  <span className="font-semibold">{p.code}</span>
                  <span className="beyu-muted">{p.name} · {p.channelCode} · {p.providerType}</span>
                </div>
                <div className="flex items-center gap-2 text-[10.5px] beyu-muted">
                  <span>priority {p.priority}</span>
                  <Badge tone={p.healthStatus === "HEALTHY" ? "gold" : p.healthStatus === "DEGRADED" ? "red" : "slate"}>{p.healthStatus}</Badge>
                  {p.countryCode && <span>{p.countryCode}</span>}
                  {p.tenantId ? <span>tenant {p.tenantId.slice(0, 8)}</span> : <span>global</span>}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            ARCHITECTURE READY: channel registry, provider registry, adapter pattern, webhook security, idempotency, delivery tracking, retry, failover, loop prevention, analytics, cost intelligence, security monitoring, consent, templates, conversations, omnichannel.
            <br />
            SIMULATED: WhatsApp, SMS, Email providers are SIMULATED by default — safe, never reaches real providers, visibly labeled.
            <br />
            NOT_CONNECTED: real providers require configuration via secret refs (env-var NAMES only, never secret values) + verification.
            <br />
            Production activation requires: provider credentials (env), webhook secrets, business approval, evidence.
          </p>
        </Panel>
      </div>
    );
  });
}
