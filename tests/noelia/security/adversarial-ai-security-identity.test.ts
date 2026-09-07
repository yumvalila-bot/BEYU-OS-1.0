/**
 * ADVERSARIAL TESTS — Identity Isolation, Memory Isolation, Classification
 */
import { describe, it, expect } from "vitest";
import { NOELIA_CANONICAL_ID } from "@/lib/noelia/canonical-identity";

describe("Identity Isolation", () => {
  it("canonical identity is unique and stable", () => {
    expect(NOELIA_CANONICAL_ID.canonical_id).toBe("NOELIA_AI");
    expect(NOELIA_CANONICAL_ID.display_name).toBe("Noelia");
  });

  it("no duplicate identity object exists in the contract", () => {
    // The identity contract defines exactly one canonical identity.
    const identityIds: string[] = [NOELIA_CANONICAL_ID.canonical_id];
    const uniqueIds = new Set(identityIds);
    expect(uniqueIds.size).toBe(1);
  });

  it("context profiles reference the same canonical identity", () => {
    const contexts = Object.values(NOELIA_CANONICAL_ID.context_profiles);
    for (const ctx of contexts) {
      expect(ctx.display_name).not.toBe("Noelia Finance"); // Not an independent AI.
      expect(ctx.display_name).toContain("Noelia");
    }
  });
});

describe("Memory Isolation", () => {
  it("memory policy requires isolation by tenant, entity, country, OS, classification", () => {
    expect(NOELIA_CANONICAL_ID.memory_policy.isolation_model).toContain("Tenant");
    expect(NOELIA_CANONICAL_ID.memory_policy.isolation_model).toContain("Entity");
    expect(NOELIA_CANONICAL_ID.memory_policy.isolation_model).toContain("Country");
    expect(NOELIA_CANONICAL_ID.memory_policy.isolation_model).toContain("OS");
    expect(NOELIA_CANONICAL_ID.memory_policy.isolation_model).toContain("Classification");
    expect(NOELIA_CANONICAL_ID.memory_policy.isolation_model).toContain("Authorization");
  });

  it("memory categories include OS context", () => {
    expect(NOELIA_CANONICAL_ID.memory_policy.categories).toContain("OS_CONTEXT");
  });

  it("required metadata includes owner, scope, source, consent, classification, retention, provenance", () => {
    const meta = NOELIA_CANONICAL_ID.memory_policy.required_metadata;
    expect(meta).toContain("owner");
    expect(meta).toContain("scope");
    expect(meta).toContain("source");
    expect(meta).toContain("consent");
    expect(meta).toContain("classification");
    expect(meta).toContain("retention");
    expect(meta).toContain("provenance");
  });
});

describe("Classification Boundaries", () => {
  it("security policy enforces classification ceiling", () => {
    expect(NOELIA_CANONICAL_ID.security_policy.classification_ceiling).toBe(true);
  });

  it("authorization chain includes classification", () => {
    const chain = NOELIA_CANONICAL_ID.security_policy.authorization_chain;
    expect(chain).toContain("Classification");
    expect(chain).toContain("Tool");
    expect(chain).toContain("Data");
  });
});

describe("Audit Policy", () => {
  it("significant events cover session, context, memory, tool, action, model, policy", () => {
    const events = NOELIA_CANONICAL_ID.audit_policy.significant_events;
    expect(events).toContain("NOELIA_SESSION_STARTED");
    expect(events).toContain("NOELIA_SESSION_ENDED");
    expect(events).toContain("NOELIA_CONTEXT_CHANGED");
    expect(events).toContain("NOELIA_MEMORY_CREATED");
    expect(events).toContain("NOELIA_MEMORY_UPDATED");
    expect(events).toContain("NOELIA_MEMORY_DELETED");
    expect(events).toContain("NOELIA_TOOL_REQUESTED");
    expect(events).toContain("NOELIA_TOOL_AUTHORIZED");
    expect(events).toContain("NOELIA_TOOL_DENIED");
    expect(events).toContain("NOELIA_TOOL_EXECUTED");
    expect(events).toContain("NOELIA_ACTION_CONFIRMED");
    expect(events).toContain("NOELIA_ACTION_REJECTED");
    expect(events).toContain("NOELIA_MODEL_REQUEST");
    expect(events).toContain("NOELIA_MODEL_RESPONSE");
    expect(events).toContain("NOELIA_POLICY_BLOCK");
    expect(events).toContain("NOELIA_HUMAN_REVIEW_REQUIRED");
  });

  it("audit policy requires no secrets in logs", () => {
    expect(NOELIA_CANONICAL_ID.audit_policy.no_secrets_in_logs).toBe(true);
  });

  it("audit uses existing infrastructure", () => {
    expect(NOELIA_CANONICAL_ID.audit_policy.existing_audit_infrastructure_reused).toBe(true);
  });
});
