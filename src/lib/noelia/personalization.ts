/**
 * NOELIA PERSONALIZATION ENGINE
 *
 * Structured, deterministic, permission-aware personalization layer.
 * Considers authorization, tenant isolation, entity isolation, country
 * isolation, OS context, classification, and approved memory.
 */
import type { Principal } from "@/lib/authz";
import type { NoeliaAuthorizedScope, NoeliaTargetContext } from "./types";
import { NOELIA_CANONICAL_ID } from "./canonical-identity";

export interface NoeliaPersonalizationProfile {
  globalUserId: string;
  role: string;
  permissions: string[];
  tenant: string;
  entity: string | null;
  country: string | null;
  os: string;
  department?: string | null;
  workflowPreferences?: Record<string, string>;
  language?: string;
  timezone?: string;
  preferences?: Record<string, unknown>;
  interactionHistory?: string[];
  approvedMemoryRefs?: string[];
  accessibilityPreferences?: Record<string, boolean>;
  communicationPreferences?: Record<string, string>;
  professionalContext?: Record<string, string>;
  authorizationScope: NoeliaAuthorizedScope;
}

export interface PersonalizationResult {
  profile: Partial<NoeliaPersonalizationProfile>;
  memoryScope: string[];
  deniedScopes: string[];
  personalizationEnabled: boolean;
  source: "AUTHORIZATION" | "MEMORY" | "PREFERENCE" | "DEFAULT";
  provenance: string;
}

export function buildPersonalizationProfile(
  principal: Principal,
  target: NoeliaTargetContext,
  scope: NoeliaAuthorizedScope,
  preferences?: Record<string, unknown>,
  accessibilityPreferences?: Record<string, boolean>,
  disabled?: boolean,
): NoeliaPersonalizationProfile {
  return {
    globalUserId: principal.userId,
    role: principal.roles.join(", ") || "UNKNOWN",
    permissions: Array.from(principal.permissions ?? new Set()),
    tenant: principal.tenantId,
    entity: target.legalEntityId ?? null,
    country: target.countryCode ?? null,
    os: "BEYU_OS",
    workflowPreferences: preferences ? (preferences.workflowPreferences as Record<string, string>) ?? ({} as Record<string, string>) : ({} as Record<string, string>),
    language: preferences ? String(preferences.language ?? "en") : "en",
    timezone: preferences ? String(preferences.timezone ?? "UTC") : "UTC",
    preferences: (preferences ? (preferences.general ?? ({} as Record<string, unknown>)) : ({} as Record<string, unknown>)) as Record<string, unknown>,
    interactionHistory: [], // Populated from session audit events.
    approvedMemoryRefs: [], // Populated from governed memory retrieval.
    accessibilityPreferences: accessibilityPreferences ?? ({} as Record<string, boolean>),
    communicationPreferences: preferences ? (preferences.communication as Record<string, string>) ?? ({} as Record<string, string>) : ({} as Record<string, string>),
    professionalContext: preferences ? (preferences.professional as Record<string, string>) ?? ({} as Record<string, string>) : ({} as Record<string, string>),
    authorizationScope: scope,
  };
}

export function resolvePersonalization(
  principal: Principal,
  target: NoeliaTargetContext,
  scope: NoeliaAuthorizedScope,
  preferences?: Record<string, unknown>,
  disabled?: boolean,
): PersonalizationResult {
  // If personalization is disabled, return empty profile with personalization disabled.
  if (disabled) {
    return {
      profile: { globalUserId: principal.userId, authorizationScope: scope },
      memoryScope: [],
      deniedScopes: ["PERSONALIZATION_DISABLED"],
      personalizationEnabled: false,
      source: "DEFAULT",
      provenance: `noelia-personalization/disabled/${principal.userId}/${Date.now()}`,
    };
  }

  // Build profile from authorization data (canonical source of truth).
  const profile = buildPersonalizationProfile(principal, target, scope, preferences);

  // Memory scope is restricted by authorization.
  const memoryScope = [
    `SESSION:${principal.sessionId ?? "unknown"}`,
    `USER:${principal.userId}`,
    `TENANT:${principal.tenantId}`,
    `ENTITY:${target.legalEntityId ?? "NONE"}`,
    `COUNTRY:${target.countryCode ?? "NONE"}`,
    `OS:${profile.os}`,
    `CLASSIFICATION:${principal.clearance ?? "PUBLIC"}`,
  ];

  // Denied scopes: any scope not covered by authorization is denied.
  const deniedScopes: string[] = [];
  if (!scope.enterprise && profile.os !== "BEYU_OS") {
    deniedScopes.push("ENTERPRISE_SCOPE_DENIED");
  }
  if (!scope.tenantIds.includes(principal.tenantId)) {
    deniedScopes.push("TENANT_DENIED");
  }
  if (target.legalEntityId && !scope.legalEntityIds.includes(target.legalEntityId)) {
    deniedScopes.push("ENTITY_DENIED");
  }
  if (target.countryCode && !scope.countryCodes.includes(target.countryCode)) {
    deniedScopes.push("COUNTRY_DENIED");
  }

  return {
    profile,
    memoryScope,
    deniedScopes: deniedScopes.length > 0 ? deniedScopes : [],
    personalizationEnabled: true,
    source: "AUTHORIZATION",
    provenance: `noelia-personalization/authorization/${principal.userId}/${principal.tenantId}/${Date.now()}`,
  };
}
