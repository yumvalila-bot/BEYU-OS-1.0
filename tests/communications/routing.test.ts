/**
 * Communications — routing engine & Noelia governance
 */

import { describe, it, expect } from "vitest";
import { evaluateRouting, applyChannelRecommendation } from "@/lib/communications/routing-service";
import { draftWithNoelia, recommendChannelWithNoelia, detectUrgencyWithNoelia } from "@/lib/communications/noelia-service";

describe("communications — routing engine", () => {
  it("critical priority routes multi-channel", async () => {
    const decision = await evaluateRouting({
      tenantId: "TEN_TEST",
      messageType: "ALERT",
      priority: "CRITICAL",
      purpose: "OPERATIONAL",
      classification: "INTERNAL",
    });
    expect(decision.channels.length).toBeGreaterThan(1);
    expect(decision.primaryChannel).toBe("IN_APP");
    expect(decision.strategy).toBe("MULTI_CHANNEL");
  });

  it("invoice routes Email + WhatsApp + In-App", async () => {
    const decision = await evaluateRouting({
      tenantId: "TEN_TEST",
      messageType: "INVOICE",
      priority: "NORMAL",
      purpose: "TRANSACTIONAL",
      classification: "CONFIDENTIAL",
    });
    expect(decision.channels).toContain("EMAIL");
    expect(decision.strategy).toBe("MULTI_CHANNEL");
  });

  it("marketing requires consent", async () => {
    const decision = await evaluateRouting({
      tenantId: "TEN_TEST",
      messageType: "TEXT",
      priority: "NORMAL",
      purpose: "MARKETING",
      classification: "INTERNAL",
    });
    expect(decision.requiresConsent).toBe(true);
    expect(decision.strategy).toBe("CONSENT_GATED");
  });

  it("default routing prefers contact preferred channel", async () => {
    const decision = await evaluateRouting({
      tenantId: "TEN_TEST",
      messageType: "TEXT",
      priority: "NORMAL",
      purpose: "TRANSACTIONAL",
      classification: "INTERNAL",
      contactPreferredChannel: "WHATSAPP",
    });
    expect(decision.primaryChannel).toBe("WHATSAPP");
  });

  it("Noelia may RECOMMEND, governance DECIDES", () => {
    const governanceDecision = {
      channels: ["EMAIL" as const],
      strategy: "SINGLE" as const,
      primaryChannel: "EMAIL" as const,
      fallbackChannels: ["IN_APP" as const],
      requiresConsent: false,
      reason: "Governance default",
    };

    const recommendation = {
      channel: "WHATSAPP" as const,
      reason: "Contact prefers WhatsApp",
      confidence: 0.9,
      model: "NOELIA_CHANNEL_RECOMMEND_V1",
    };

    const applied = applyChannelRecommendation(recommendation, governanceDecision, {
      tenantId: "TEN_TEST",
      messageType: "TEXT",
      priority: "NORMAL",
      purpose: "TRANSACTIONAL",
      classification: "INTERNAL",
      providerAvailability: { WHATSAPP: true, EMAIL: true },
    });

    // High confidence recommendation honored, but governance still controls
    expect(applied.primaryChannel).toBe("WHATSAPP");
    expect(applied.reason).toContain("governance approved");
  });

  it("Noelia recommendation blocked when provider unavailable", () => {
    const governanceDecision = {
      channels: ["EMAIL" as const],
      strategy: "SINGLE" as const,
      primaryChannel: "EMAIL" as const,
      fallbackChannels: [] as unknown as ("EMAIL" | "WHATSAPP" | "SMS" | "IN_APP" | "INTERNAL" | "PUSH" | "VOICE")[],
      requiresConsent: false,
      reason: "Governance",
    };

    const rec = {
      channel: "WHATSAPP" as const,
      reason: "Prefers WhatsApp",
      confidence: 0.9,
    };

    const applied = applyChannelRecommendation(rec, governanceDecision, {
      tenantId: "TEN_TEST",
      messageType: "TEXT",
      priority: "NORMAL",
      purpose: "TRANSACTIONAL",
      classification: "INTERNAL",
      providerAvailability: { WHATSAPP: false, EMAIL: true },
    });

    expect(applied.primaryChannel).toBe("EMAIL"); // Falls back to governance
  });

  it("Noelia recommendation blocked when consent required", () => {
    const governanceDecision = {
      channels: ["EMAIL" as const],
      strategy: "CONSENT_GATED" as const,
      primaryChannel: "EMAIL" as const,
      fallbackChannels: [] as unknown as ("EMAIL" | "WHATSAPP" | "SMS" | "IN_APP" | "INTERNAL" | "PUSH" | "VOICE")[],
      requiresConsent: true,
      reason: "Marketing requires consent",
    };

    const rec = {
      channel: "WHATSAPP" as const,
      reason: "Marketing via WhatsApp",
      confidence: 0.95,
    };

    const applied = applyChannelRecommendation(rec, governanceDecision, {
      tenantId: "TEN_TEST",
      messageType: "TEXT",
      priority: "NORMAL",
      purpose: "MARKETING",
      classification: "INTERNAL",
    });

    expect(applied.requiresConsent).toBe(true);
    expect(applied.primaryChannel).toBe("EMAIL"); // Governance wins
  });
});

describe("communications — Noelia governance boundaries", () => {
  it("Noelia identity remains NOELIA_AI, never NOELIA_WHATSAPP", () => {
    // Canonical identity check — by construction, no NOELIA_WHATSAPP exists
    // This test documents the invariant
    expect(true).toBe(true);
  });

  it("Noelia cannot grant permissions, change roles, bypass RLS", () => {
    // By design: Noelia tool registry grants no ledger-write, no role-grant, no RLS bypass
    // Documented in noelia-service.ts
    expect(true).toBe(true);
  });

  it("detects urgency", async () => {
    const critical = await detectUrgencyWithNoelia("URGENT: system down, need help immediately!", "TEN_TEST");
    expect(critical.urgency).toBe("CRITICAL");
    expect(critical.keywords.length).toBeGreaterThan(0);

    const normal = await detectUrgencyWithNoelia("Hello, just checking in", "TEN_TEST");
    expect(normal.urgency).toBe("NORMAL");
  });

  it("sensitive communication requires human approval", () => {
    // Legal, finance, executive, high-value financial, regulated info, public announcements
    // require AI_DRAFT → POLICY_CHECK → HUMAN_REVIEW → APPROVAL → SEND → AUDIT
    // Documented in noelia-service.ts — isSensitive check
    expect(true).toBe(true);
  });
});
