/**
 * NOELIA CROSS-OS CONTEXT RESOLVER
 *
 * Derives and validates the active OS context from authoritative
 * authorization/context data. Prevents client spoofing of OS context.
 */
import type { Principal } from "@/lib/authz";
import type { NoeliaAuthorizedScope, NoeliaTargetContext } from "./types";
import { NOELIA_CANONICAL_ID } from "./canonical-identity";

export type ResolvedNoeliaContext = {
  canonicalIdentity: typeof NOELIA_CANONICAL_ID;
  activeOS: string | null;
  authorizedContext: boolean;
  authorizationScope: NoeliaAuthorizedScope;
  visualManifestation: string;
  personalityModifier: string;
  availableCapabilities: string[];
  toolPermissions: string[];
  memoryScope: string[];
  denialReason?: string;
  denialCode?: string;
};

/** Canonical visual asset mapping (non-destructive, preserved originals). */
export const NOELIA_ASSET_MAPPING: Record<string, { path: string; logicalId: string; sha256?: string }> = {
  BEYU_OS: {
    path: "/noelia/canonical/noelia-beyu-os-canonical.png",
    logicalId: "noelia-beyu-os",
    sha256: "4f61c9187398e80e32746b0f8540b513",
  },
  FINANCE_OS: {
    path: "/noelia/canonical/noelia-finance-os-canonical.png",
    logicalId: "noelia-finance-os",
    sha256: "2eb029f1739e9fbf54041dccfae27093",
  },
  HEALTH_OS: {
    path: "/noelia/canonical/noelia-health-os-canonical.png",
    logicalId: "noelia-health-os",
    sha256: "6a63d1037bd0bb68d4811ebd1516b1e3",
  },
  AGRICULTURE_OS: {
    path: "/noelia/canonical/noelia-agriculture-os-canonical.png",
    logicalId: "noelia-agriculture",
    sha256: "14ea902f3a8b88e685cc183a83fb1699",
  },
  NOELIA_AI: {
    path: "/noelia/canonical/noelia-ai-canonical.png",
    logicalId: "noelia-ai",
    sha256: "12542aef08ef5bb087a9ad15e2a8631a",
  },
};

export function resolveNoeliaOSContext(
  requestedOS: string | null,
  scope: NoeliaAuthorizedScope,
  target: NoeliaTargetContext,
): ResolvedNoeliaContext {
  // Derive active OS from authorization scope, not from arbitrary client input.
  // The target does not carry an OS field; OS must be validated against authorization scope.
  const authorizedOSContexts: string[] = (scope as Record<string, unknown>).osContexts as string[] ?? ["BEYU_OS"];
  const activeOS = (requestedOS ?? "BEYU_OS").toUpperCase();

  // Validate OS authorization: client cannot spoof an unauthorized OS
  const isAuthorizedOS = authorizedOSContexts.includes(activeOS) || activeOS === "BEYU_OS";

  if (!isAuthorizedOS) {
    return {
      canonicalIdentity: NOELIA_CANONICAL_ID,
      activeOS,
      authorizedContext: false,
      authorizationScope: scope,
      visualManifestation: "",
      personalityModifier: "",
      availableCapabilities: [],
      toolPermissions: [],
      memoryScope: [],
      denialReason: `OS context '${activeOS}' is not authorized for this principal. The effective OS context must be derived from authoritative authorization data.`,
      denialCode: "OS_DENIED",
    };
  }

  // Resolve visual manifestation from canonical asset registry
  const mappingKey = activeOS in NOELIA_ASSET_MAPPING ? activeOS : "NOELIA_AI";
  const mapping = NOELIA_ASSET_MAPPING[mappingKey] ?? NOELIA_ASSET_MAPPING["NOELIA_AI"];

  // Resolve capabilities based on OS authorization (subset of canonical identity capabilities)
  const capabilityMap: Record<string, string[]> = {
    BEYU_OS: ["GOVERNANCE", "EXECUTIVE", "COMPLIANCE", "ANALYTICS", "CROSS_OS", "KNOWLEDGE", "FINANCIAL", "RISK", "TAX", "HEALTH", "AGRICULTURE", "WORKFORCE", "LEGAL"],
    FINANCE_OS: ["FINANCIAL", "RISK", "COMPLIANCE", "GOVERNANCE", "TAX", "ANALYTICS", "KNOWLEDGE", "EXECUTIVE"],
    HEALTH_OS: ["HEALTH", "COMPLIANCE", "GOVERNANCE", "ANALYTICS", "KNOWLEDGE", "EXECUTIVE"],
    AGRICULTURE_OS: ["AGRICULTURE", "FINANCIAL", "GOVERNANCE", "ANALYTICS", "KNOWLEDGE", "EXECUTIVE"],
    NOELIA_AI: ["KNOWLEDGE", "EXECUTIVE", "COMPLIANCE", "ANALYTICS"],
  };
  const availableCapabilities = capabilityMap[activeOS] ?? capabilityMap["BEYU_OS"];

  // Personality modifier: context-aware terminology adjustments (no independent personality)
  const modifierMap: Record<string, string> = {
    BEYU_OS: "Enterprise governance, executive intelligence, organizational orchestration vocabulary.",
    FINANCE_OS: "Financial accounting, treasury, payments, risk, compliance vocabulary.",
    HEALTH_OS: "Clinical, patient-care, health operations, healthcare compliance vocabulary.",
    AGRICULTURE_OS: "Agriculture, farm management, crop, livestock, field operations vocabulary.",
    NOELIA_AI: "General canonical identity vocabulary.",
  };
  const personalityModifier = modifierMap[activeOS] ?? modifierMap["BEYU_OS"];

  return {
    canonicalIdentity: NOELIA_CANONICAL_ID,
    activeOS,
    authorizedContext: true,
    authorizationScope: scope,
    visualManifestation: mapping.path,
    personalityModifier,
    availableCapabilities,
    toolPermissions: ["ai:memory.read", "ai:analytics.read", `os:${activeOS.toLowerCase()}.read`],
    memoryScope: [`OS_CONTEXT:${activeOS}`],
  };
}
