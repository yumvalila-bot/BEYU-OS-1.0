import { DOMAIN_REGISTRY, type DomainCode } from "./domains";

export const CONNECTIVITY_DIRECTION = ["INBOUND", "OUTBOUND", "BIDIRECTIONAL"] as const;
export type ConnectivityDirection = (typeof CONNECTIVITY_DIRECTION)[number];
export const CONNECTIVITY_INTERACTION = ["EVENT", "COMMAND", "QUERY", "REFERENCE", "DOCUMENT", "STATUS"] as const;
export type ConnectivityInteraction = (typeof CONNECTIVITY_INTERACTION)[number];

export type ConnectivityEdge = {
  source: DomainCode;
  destination: DomainCode;
  contract: string;
  authority: string;
  dataClass: string;
  direction: ConnectivityDirection;
  interaction: ConnectivityInteraction;
  trace: string;
  failureMode: "FAIL_CLOSED" | "DEGRADE_SAFELY" | "DATA_NOT_AVAILABLE" | "REQUIRES_AUTHORITY";
  continuityRequirement: string;
};

/**
 * The one documented cross-domain graph. It describes existing seams and
 * planned consumption boundaries; it does not create an event broker or a
 * second authorization path.
 */
export const CONNECTIVITY_GRAPH: readonly ConnectivityEdge[] = [
  {
    source: "IDENTITY",
    destination: "HCM",
    contract: "identity graph / HCM workforce consumption",
    authority: "common permission + HCM read authority",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "QUERY",
    trace: "request trace → HCM response",
    failureMode: "FAIL_CLOSED",
    continuityRequirement: "employee reads may be retried; no identity invention",
  },
  {
    source: "IDENTITY",
    destination: "GOVERNANCE",
    contract: "resolved principal / body membership",
    authority: "governance permission + seat authority",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "QUERY",
    trace: "principal trace → governance mutation",
    failureMode: "FAIL_CLOSED",
    continuityRequirement: "no governance transition without resolved principal",
  },
  {
    source: "GOVERNANCE",
    destination: "AUTHORITY",
    contract: "decision and capability registry",
    authority: "constitution and ratified decision",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "STATUS",
    trace: "decision trace → capability evaluation",
    failureMode: "REQUIRES_AUTHORITY",
    continuityRequirement: "activation state is durable and must not be inferred on retry",
  },
  {
    source: "AUTHORITY",
    destination: "SECURITY",
    contract: "scoped capability / permission binding",
    authority: "6C authority gate",
    dataClass: "RESTRICTED",
    direction: "BIDIRECTIONAL",
    interaction: "QUERY",
    trace: "authority explanation → request trace",
    failureMode: "FAIL_CLOSED",
    continuityRequirement: "unknown authority cannot become permission",
  },
  {
    source: "GOVERNANCE",
    destination: "FINANCE",
    contract: "governed resolution / capital authorization signal",
    authority: "governance decision plus Finance capability gate",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "COMMAND",
    trace: "resolution trace → Finance audit/event",
    failureMode: "REQUIRES_AUTHORITY",
    continuityRequirement: "duplicate request is idempotent; no funding replay",
  },
  {
    source: "HCM",
    destination: "FINANCE",
    contract: "workforce identity/reference only",
    authority: "HCM read permission and Finance consumer scope",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "REFERENCE",
    trace: "consumer trace → source HCM record",
    failureMode: "DATA_NOT_AVAILABLE",
    continuityRequirement: "no payroll or employee copy is created in Finance",
  },
  {
    source: "FINANCE",
    destination: "TAX",
    contract: "financial/entity facts for candidate tax analysis",
    authority: "Finance read + tax analysis permission",
    dataClass: "RESTRICTED",
    direction: "BIDIRECTIONAL",
    interaction: "QUERY",
    trace: "assessment trace → tax strategy/evidence",
    failureMode: "REQUIRES_AUTHORITY",
    continuityRequirement: "tax analysis never mutates ledger or creates liability",
  },
  {
    source: "LEGAL",
    destination: "GOVERNANCE",
    contract: "legal evidence/matter reference",
    authority: "human legal governance",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "DOCUMENT",
    trace: "document provenance → governance decision",
    failureMode: "REQUIRES_AUTHORITY",
    continuityRequirement: "missing legal interpretation is human review, not default allow",
  },
  {
    source: "FINANCE",
    destination: "AUDIT",
    contract: "financial mutation audit/event pair",
    authority: "Finance operation plus common audit writer",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "EVENT",
    trace: "financial operation trace → audit/event chain",
    failureMode: "FAIL_CLOSED",
    continuityRequirement: "local transaction rolls back domain mutation if evidence append fails",
  },
  {
    source: "GOVERNANCE",
    destination: "AUDIT",
    contract: "governance transition audit/event pair",
    authority: "governance permission and body authority",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "EVENT",
    trace: "governance trace → audit/event chain",
    failureMode: "FAIL_CLOSED",
    continuityRequirement: "decision and evidence commit atomically",
  },
  {
    source: "AI",
    destination: "AUDIT",
    contract: "Noelia decision register and event",
    authority: "inherited human principal; AI cannot self-authorize",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "EVENT",
    trace: "Noelia request trace → ai_decisions/audit/event",
    failureMode: "FAIL_CLOSED",
    continuityRequirement: "answer is not returned as durable decision if evidence transaction fails",
  },
  {
    source: "HEALTH",
    destination: "HCM",
    contract: "future Sector OS HCM consumption contract",
    authority: "BEYU OS registration and HCM read authority",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "QUERY",
    trace: "common envelope required",
    failureMode: "DATA_NOT_AVAILABLE",
    continuityRequirement: "Sector OS must not create a workforce fallback master",
  },
  {
    source: "AGRICULTURE",
    destination: "FINANCE",
    contract: "future Sector OS Finance consumption contract",
    authority: "BEYU OS authority/capability gate",
    dataClass: "RESTRICTED",
    direction: "OUTBOUND",
    interaction: "COMMAND",
    trace: "common envelope required",
    failureMode: "DATA_NOT_AVAILABLE",
    continuityRequirement: "no sector-side financial truth or replayable mutation",
  },
  {
    source: "FOUNDATION",
    destination: "GOVERNANCE",
    contract: "Foundation programme/resolution reference",
    authority: "BEYU OS governance and Foundation tenant scope",
    dataClass: "RESTRICTED",
    direction: "BIDIRECTIONAL",
    interaction: "STATUS",
    trace: "common envelope required",
    failureMode: "REQUIRES_AUTHORITY",
    continuityRequirement: "programme funding remains separate from execution settlement",
  },
];

export function connectivityGraph(): ConnectivityEdge[] {
  return CONNECTIVITY_GRAPH.map((edge) => ({ ...edge }));
}

export function connectivityNodes(): DomainCode[] {
  return DOMAIN_REGISTRY.map((domain) => domain.domainCode).sort();
}

export function edgesFrom(source: DomainCode): ConnectivityEdge[] {
  return CONNECTIVITY_GRAPH.filter((edge) => edge.source === source).map((edge) => ({ ...edge }));
}
