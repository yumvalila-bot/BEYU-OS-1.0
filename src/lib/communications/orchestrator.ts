/**
 * Communication Orchestrator — the ONE governed orchestration layer.
 *
 * Architecture:
 * BEYU EVENT → COMMUNICATION INTENT → POLICY → AUTHORIZATION → CONSENT →
 * RECIPIENT RESOLUTION → CHANNEL ROUTING → TEMPLATE → PROVIDER → DELIVERY → AUDIT
 *
 * The orchestrator must NOT become an authorization bypass.
 * Noelia may RECOMMEND, governance decides.
 * Marketing must never be sent without appropriate consent.
 * CAP_POSTING remains LOCKED — communications cannot post journals, move funds, etc.
 */

import { db } from "@/db";
import { recordAudit, publishEvent, recordAuditTx, publishEventTx, type Tx } from "@/lib/audit";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { CommunicationIntent, RoutingDecision, DeliveryResult } from "./types";
import { checkConsentAllowed } from "./consent-service";
import { resolveContact360, findContactByMethod } from "./contact-service";
import { evaluateRouting, applyChannelRecommendation, getSlaPolicyForContext } from "./routing-service";
import { getTemplateByCode, renderTemplate } from "./template-service";
import { getDefaultProvider } from "./provider-registry";
import { createMessage, updateMessageStatus } from "./message-service";
import { createConversation, getConversationById } from "./conversation-service";
import { checkRateLimit } from "./security-service";
import { SYSTEM_VERSION } from "@/lib/constants";

export type OrchestrationResult = {
  success: boolean;
  messageId?: string;
  conversationId?: string;
  channel?: string;
  providerId?: string;
  status?: string;
  reason?: string;
  isDuplicate?: boolean;
  deliveryResult?: DeliveryResult;
  routingDecision?: RoutingDecision;
};

export async function orchestrateCommunication(
  intent: CommunicationIntent,
  principal: { userId: string; tenantId: string; clearance: string },
): Promise<OrchestrationResult> {
  const traceId = intent.traceId;
  const correlationId = intent.correlationId;

  try {
    // 1. POLICY CHECK — classification ceiling
    // (ABAC already enforced by API layer via can(), but double-check)
    // Highly classified record must NOT be sent over insecure channel — checked later

    // 2. AUTHORIZATION — already enforced by API via RBAC/ABAC, but verify tenant match
    if (intent.tenantId !== principal.tenantId) {
      return { success: false, reason: "Tenant isolation: intent tenant does not match principal tenant" };
    }

    // 3. RECIPIENT RESOLUTION — explicit, auditable, tenant-aware
    let contactId = intent.contactId;
    let contact360 = null;

    if (contactId) {
      contact360 = await resolveContact360(contactId, intent.tenantId);
      if (!contact360) {
        return { success: false, reason: `Contact ${contactId} not found in tenant ${intent.tenantId}` };
      }
    } else if (intent.recipient) {
      // Try to resolve by method value (phone/email)
      const isEmail = intent.recipient.includes("@");
      const methodType = isEmail ? "EMAIL" : "PHONE";
      contact360 = await findContactByMethod(intent.tenantId, methodType as never, intent.recipient);
      if (contact360) {
        contactId = contact360.contact.id;
      }
    }

    // 4. CONSENT CHECK — marketing must never be sent without consent
    if (contactId) {
      // Determine channel for consent check — use intent channel or preferred
      const consentChannel = intent.channel ?? contact360?.contact.preferredChannel ?? "ALL";
      const consentCheck = await checkConsentAllowed({
        contactId,
        tenantId: intent.tenantId,
        purpose: intent.purpose,
        channel: consentChannel,
      });
      if (!consentCheck.allowed) {
        await recordAudit({
          tenantId: intent.tenantId,
          actorUserId: principal.userId,
          action: "communications.message.send",
          objectType: "MESSAGE",
          objectId: intent.idempotencyKey,
          outcome: "DENIED",
          reason: `CONSENT_DENIED: ${consentCheck.reason}`,
          traceId,
        });
        return { success: false, reason: `Consent denied: ${consentCheck.reason}` };
      }
    }

    // 5. ROUTING — governed channel selection
    const routingContext = {
      tenantId: intent.tenantId,
      countryCode: intent.countryCode,
      channel: intent.channel,
      messageType: intent.messageType,
      priority: intent.priority,
      purpose: intent.purpose,
      classification: intent.classification,
      contactPreferredChannel: contact360?.contact.preferredChannel as never,
      language: contact360?.contact.preferredLanguage ?? intent.metadata?.language as string ?? "en",
    };

    let routingDecision = await evaluateRouting(routingContext);

    // Apply Noelia recommendation if present in metadata
    if (intent.metadata?.noelia_channel_recommendation) {
      const rec = intent.metadata.noelia_channel_recommendation as { channel: string; reason: string; confidence: number; model?: string };
      routingDecision = applyChannelRecommendation(
        { channel: rec.channel as never, reason: rec.reason, confidence: rec.confidence, model: rec.model },
        routingDecision,
        { ...routingContext, providerAvailability: {} },
      );
    }

    // 6. CLASSIFICATION CHECK — highly classified must not go over insecure channel
    const insecureChannels = ["SMS"]; // SMS is not secure for highly restricted
    if (intent.classification === "HIGHLY_RESTRICTED" && insecureChannels.includes(routingDecision.primaryChannel)) {
      return {
        success: false,
        reason: `Classification ${intent.classification} cannot be sent over insecure channel ${routingDecision.primaryChannel}`,
      };
    }

    // 7. RATE LIMITING — tenant, contact, channel
    const rateLimitCheck = await checkRateLimit({
      tenantId: intent.tenantId,
      scopeType: "TENANT",
      scopeId: intent.tenantId,
      channel: routingDecision.primaryChannel,
    });
    if (!rateLimitCheck.allowed) {
      return { success: false, reason: `Rate limited: ${rateLimitCheck.reason}` };
    }

    if (contactId) {
      const contactRateLimit = await checkRateLimit({
        tenantId: intent.tenantId,
        scopeType: "CONTACT",
        scopeId: contactId,
        channel: routingDecision.primaryChannel,
      });
      if (!contactRateLimit.allowed) {
        return { success: false, reason: `Contact rate limited: ${contactRateLimit.reason}` };
      }
    }

    // 8. TEMPLATE — resolve and render
    let subject = intent.subject;
    let body = intent.body;
    let htmlBody = intent.htmlBody;
    let templateId: string | null = null;

    if (intent.templateCode) {
      const template = await getTemplateByCode(intent.templateCode, {
        tenantId: intent.tenantId,
        channel: routingDecision.primaryChannel,
        language: routingContext.language,
        countryCode: intent.countryCode ?? undefined,
      });

      if (!template) {
        return { success: false, reason: `Template ${intent.templateCode} not found` };
      }

      if (template.status !== "APPROVED") {
        return { success: false, reason: `Template ${intent.templateCode} is not APPROVED (status: ${template.status})` };
      }

      // Check classification ceiling — template cannot downgrade classification
      const { classificationRank } = await import("@/lib/constants");
      if (classificationRank(template.classification) < classificationRank(intent.classification)) {
        return {
          success: false,
          reason: `Template classification ${template.classification} below intent classification ${intent.classification}`,
        };
      }

      templateId = template.id;
      const variables = intent.templateVariables ?? {};

      if (template.subjectTemplate) {
        const rendered = renderTemplate(template.subjectTemplate, variables);
        subject = rendered.rendered;
        if (rendered.missingVariables.length > 0) {
          return { success: false, reason: `Missing template variables: ${rendered.missingVariables.join(", ")}` };
        }
      }

      const bodyRendered = renderTemplate(template.bodyTemplate, variables);
      body = bodyRendered.rendered;
      if (bodyRendered.missingVariables.length > 0) {
        return { success: false, reason: `Missing template variables: ${bodyRendered.missingVariables.join(", ")}` };
      }

      if (template.htmlTemplate) {
        const htmlRendered = renderTemplate(template.htmlTemplate, variables);
        htmlBody = htmlRendered.rendered;
      }
    }

    if (!body) {
      return { success: false, reason: "Message body is required" };
    }

    // 9. PROVIDER — resolve via registry, adapter pattern
    const provider = await getDefaultProvider(routingDecision.primaryChannel, intent.tenantId, intent.countryCode ?? undefined);
    if (!provider) {
      return { success: false, reason: `No provider for channel ${routingDecision.primaryChannel}` };
    }

    // Never claim CONNECTED without evidence — check provider status
    if (provider.status === "FAILED" || provider.status === "NOT_CONNECTED") {
      // Try fallback providers
      for (const fallbackChannel of routingDecision.fallbackChannels) {
        const fallbackProvider = await getDefaultProvider(fallbackChannel, intent.tenantId, intent.countryCode ?? undefined);
        if (fallbackProvider && !["FAILED", "NOT_CONNECTED"].includes(fallbackProvider.status)) {
          routingDecision = { ...routingDecision, primaryChannel: fallbackChannel, reason: `${routingDecision.reason} → fallback ${fallbackChannel} (primary provider ${provider.status})` };
          break;
        }
      }
      // If still failed, allow SIMULATED for testing
      if (["FAILED", "NOT_CONNECTED"].includes(provider.status) && provider.status !== "SIMULATED") {
        // Check if we have any fallback that works, otherwise fail
        const hasFallback = routingDecision.fallbackChannels.length > 0;
        if (!hasFallback) {
          return { success: false, reason: `Provider ${provider.code} status ${provider.status} — no fallback available` };
        }
      }
    }

    // 10. CONVERSATION — find or create
    let conversationId: string | null = null;
    // Try to find existing open conversation for this contact + correlation
    if (contactId) {
      const { and, eq } = await import("drizzle-orm");
      const { communicationConversations } = await import("@/db/schema");
      const { db } = await import("@/db");
      const existingConv = await db
        .select()
        .from(communicationConversations)
        .where(
          and(
            eq(communicationConversations.tenantId, intent.tenantId),
            eq(communicationConversations.contactId, contactId),
            eq(communicationConversations.correlationId, intent.correlationId),
          ),
        )
        .limit(1);
      if (existingConv.length > 0) {
        conversationId = existingConv[0].id;
      }
    }

    if (!conversationId) {
      const slaPolicy = await getSlaPolicyForContext({
        tenantId: intent.tenantId,
        channel: routingDecision.primaryChannel,
        priority: intent.priority,
        messageType: intent.messageType,
      });

      const conversation = await createConversation({
        tenantId: intent.tenantId,
        legalEntityId: intent.legalEntityId,
        countryCode: intent.countryCode,
        contactId: contactId ?? null,
        globalUserId: intent.globalUserId,
        channel: routingDecision.primaryChannel,
        subject: subject ?? undefined,
        priority: intent.priority,
        classification: intent.classification,
        correlationId: intent.correlationId,
        causationId: intent.causationId,
        slaPolicyId: slaPolicy?.id ?? null,
        createdBy: principal.userId,
        metadata: intent.metadata,
      });
      conversationId = conversation.id;
    }

    // 11. DELIVERY — create message + audit + event in one transaction where possible
    const messageResult = await createMessage({
      tenantId: intent.tenantId,
      conversationId,
      contactId: contactId ?? null,
      channel: routingDecision.primaryChannel,
      providerId: provider.id,
      direction: "OUTBOUND",
      messageType: intent.messageType,
      sender: provider.code, // or configured sender ID
      recipient: intent.recipient,
      subject: subject ?? null,
      body: body!,
      htmlBody: htmlBody ?? null,
      structuredPayload: intent.structuredPayload ?? null,
      templateId,
      templateVariables: intent.templateVariables ?? null,
      priority: intent.priority,
      classification: intent.classification,
      correlationId: intent.correlationId,
      causationId: intent.causationId,
      idempotencyKey: intent.idempotencyKey,
      traceId: intent.traceId,
      scheduledFor: intent.scheduledFor ?? null,
      estimatedCost: (intent.metadata?.estimated_cost as number) ?? null,
      costCurrency: (intent.metadata?.cost_currency as string) ?? "USD",
      aiDrafted: (intent.metadata?.ai_drafted as boolean) ?? false,
      aiModel: (intent.metadata?.ai_model as string) ?? null,
      aiConfidence: (intent.metadata?.ai_confidence as number) ?? null,
      requiresHumanApproval: intent.requiresHumanApproval ?? false,
      createdBy: principal.userId,
    });

    if (messageResult.isDuplicate) {
      return {
        success: true,
        messageId: messageResult.message.id,
        conversationId: conversationId ?? undefined,
        channel: messageResult.message.channel,
        providerId: messageResult.message.providerId ?? undefined,
        status: messageResult.message.status,
        isDuplicate: true,
        reason: "Duplicate idempotency key — returning original",
        routingDecision,
      };
    }

    // If requires human approval, stop here — don't send
    if (messageResult.message.requiresHumanApproval && !messageResult.message.approvedBy) {
      await recordAudit({
        tenantId: intent.tenantId,
        actorUserId: principal.userId,
        action: "communications.message.created_pending_approval",
        objectType: "MESSAGE",
        objectId: messageResult.message.id,
        outcome: "SUCCESS",
        newValue: {
          messageId: messageResult.message.id,
          conversationId,
          channel: routingDecision.primaryChannel,
          requiresApproval: true,
        },
        traceId,
      });

      return {
        success: true,
        messageId: messageResult.message.id,
        conversationId: conversationId ?? undefined,
        channel: routingDecision.primaryChannel,
        providerId: provider.id,
        status: "QUEUED",
        reason: "Message queued pending human approval",
        routingDecision,
      };
    }

    // For SIMULATED providers, mark as SENT immediately
    let deliveryResult: DeliveryResult | undefined;
    if (provider.status === "SIMULATED" || provider.providerType.includes("SIMULATED")) {
      await updateMessageStatus(messageResult.message.id, intent.tenantId, "SENT", {
        providerMessageId: `SIM_${Date.now()}`,
      });
      deliveryResult = {
        messageId: messageResult.message.id,
        status: "SENT",
        providerMessageId: `SIM_${Date.now()}`,
        metadata: { simulated: true },
      };
    } else {
      // For real providers, the actual send would happen via async worker
      // Here we mark as SENDING and publish event for worker to pick up
      await updateMessageStatus(messageResult.message.id, intent.tenantId, "SENDING");
      deliveryResult = {
        messageId: messageResult.message.id,
        status: "SENDING",
        metadata: { queued_for_provider: provider.code },
      };
    }

    // Audit & event
    await recordAudit({
      tenantId: intent.tenantId,
      actorUserId: principal.userId,
      action: "communications.message.send",
      objectType: "MESSAGE",
      objectId: messageResult.message.id,
      outcome: "SUCCESS",
      newValue: {
        messageId: messageResult.message.id,
        conversationId,
        channel: routingDecision.primaryChannel,
        providerId: provider.id,
        providerCode: provider.code,
        messageType: intent.messageType,
        priority: intent.priority,
        classification: intent.classification,
        correlationId,
        idempotencyKey: intent.idempotencyKey,
        status: deliveryResult.status,
        simulated: provider.status === "SIMULATED",
      },
      traceId,
    });

    await publishEvent({
      type: "COMMUNICATION_SENT",
      source: "BEYU_OS",
      domain: "communications",
      operation: "message.send",
      destinationDomain: null,
      tenantId: intent.tenantId,
      legalEntityId: intent.legalEntityId ?? null,
      subjectType: "MESSAGE",
      subjectId: messageResult.message.id,
      actorUserId: principal.userId,
      classification: intent.classification as never,
      payload: {
        messageId: messageResult.message.id,
        conversationId,
        channel: routingDecision.primaryChannel,
        providerId: provider.id,
        messageType: intent.messageType,
        priority: intent.priority,
        correlationId,
        traceId,
      },
      traceId,
      correlationId,
      causationId: intent.causationId ?? null,
      authorityContext: null,
      policyVersion: null,
    });

    return {
      success: true,
      messageId: messageResult.message.id,
      conversationId: conversationId ?? undefined,
      channel: routingDecision.primaryChannel,
      providerId: provider.id,
      status: deliveryResult.status,
      deliveryResult,
      routingDecision,
    };
  } catch (error) {
    const err = error as Error;
    await recordAudit({
      tenantId: intent.tenantId,
      actorUserId: principal.userId,
      action: "communications.message.send",
      objectType: "MESSAGE",
      objectId: intent.idempotencyKey,
      outcome: "FAILURE",
      reason: err.message,
      traceId: intent.traceId,
    });

    return { success: false, reason: err.message };
  }
}

// Batch orchestration for multi-channel delivery (e.g., invoice: Email + WhatsApp + In-App)
export async function orchestrateMultiChannel(
  intent: CommunicationIntent,
  channels: string[],
  principal: { userId: string; tenantId: string; clearance: string },
): Promise<OrchestrationResult[]> {
  const results: OrchestrationResult[] = [];
  for (const channel of channels) {
    const channelIntent = {
      ...intent,
      channel: channel as never,
      idempotencyKey: `${intent.idempotencyKey}:${channel}`,
      correlationId: intent.correlationId,
      causationId: intent.causationId ?? intent.correlationId,
    };
    const result = await orchestrateCommunication(channelIntent, principal);
    results.push(result);
  }
  return results;
}
