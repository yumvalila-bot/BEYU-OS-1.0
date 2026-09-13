/**
 * Agriculture OS — Food Export Noelia tools (governed intelligence)
 *
 * Permitted:
 * - status summaries
 * - traceability queries
 * - missing-document detection
 * - compliance readiness analysis
 * - shipment exception analysis
 * - operational analytics
 *
 * Forbidden:
 * - self-authorization, approval, certification, government submission,
 *   hold release, shipment authorization, financial posting, RBAC/ABAC/RLS bypass
 *
 * All tools are sideEffects NONE, idempotent, read-only.
 */
import { z } from "zod";
import type { NoeliaToolRegistry } from "./tool-registry";
import { noeliaToolOutputSchema } from "./default-tools";
import type { ToolInvocationContext, NoeliaFinding } from "./types";
import { db, hasDatabaseTransactionContext } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import * as s from "@/db/schema";

function requireContext() {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia export tools require canonical tenant context");
  }
}

const ENVELOPE = z.object({ question: z.string().optional() }).passthrough().optional();
const ORDER_QUERY = z.object({
  exportOrderId: z.string().min(1),
  question: z.string().optional(),
}).passthrough();

export function registerAgricultureExportTools(registry: NoeliaToolRegistry): void {
  const audit = { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" } as const;

  registry.register({
    name: "agriculture.export.orders.summary",
    permission: "agriculture:data.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Summarise authorised export orders by status, destination country and buyer. Read-only; cannot approve or transition.",
    metadata: {
      stableId: "cap-agriculture-export-orders-summary",
      version: "1.0.0",
      ownerRole: "SECTOR_OPERATOR",
      domain: "AGRICULTURE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext) => {
      requireContext();
      try {
        const tenantId = context.target.tenantId;
        const statusRows = await db
          .select({ status: s.exportOrders.status, count: sql<number>`count(*)::int`, qty: sql<string>`coalesce(sum(${s.exportOrders.quantity}),0)` })
          .from(s.exportOrders)
          .where(eq(s.exportOrders.tenantId, tenantId))
          .groupBy(s.exportOrders.status);

        const countryRows = await db
          .select({ country: s.exportOrders.destinationCountryCode, count: sql<number>`count(*)::int` })
          .from(s.exportOrders)
          .where(eq(s.exportOrders.tenantId, tenantId))
          .groupBy(s.exportOrders.destinationCountryCode);

        const holds = await db
          .select({ holdType: s.exportHolds.holdType, count: sql<number>`count(*)::int` })
          .from(s.exportHolds)
          .where(and(eq(s.exportHolds.tenantId, tenantId), eq(s.exportHolds.status, "ACTIVE")))
          .groupBy(s.exportHolds.holdType);

        const findings: NoeliaFinding[] = [];
        for (const r of statusRows) {
          findings.push({
            label: `Export orders · ${r.status}`,
            value: `${r.count} order(s), total qty ${Number(r.qty).toLocaleString()}`,
            kind: "FACT",
            status: "OBSERVED",
            provenance: "agriculture_export_orders",
          });
        }
        for (const r of countryRows) {
          findings.push({
            label: `Destination · ${r.country}`,
            value: `${r.count} order(s)`,
            kind: "FACT",
            status: "OBSERVED",
            provenance: "agriculture_export_orders",
          });
        }
        for (const r of holds) {
          findings.push({
            label: `Active hold · ${r.holdType}`,
            value: `${r.count} hold(s)`,
            kind: "FACT",
            status: "REQUIRES_HUMAN_REVIEW",
            provenance: "agriculture_export_holds",
          });
        }

        return {
          headline: `Export orders: ${statusRows.reduce((a, b) => a + b.count, 0)} total, ${holds.reduce((a, b) => a + b.count, 0)} active hold(s).`,
          findings,
          narrative: "Export order summary is operational truth only. Finance OS remains canonical for financial consequences; CAP_POSTING is LOCKED. Noelia cannot approve, release holds or authorize shipments.",
          confidence: 0.86,
          humanReviewRequired: holds.length > 0,
          metadata: { financeBoundary: { journals: "FINANCE_OS_ONLY", capPosting: "LOCKED" } },
        };
      } catch {
        return {
          headline: "Export orders summary unavailable — migration pending or no data.",
          findings: [{ label: "Export orders", value: "UNAVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
          narrative: "Operational truth only; Finance boundary preserved.",
          confidence: 0.3,
        };
      }
    },
  });

  registry.register({
    name: "agriculture.export.traceability.query",
    permission: "agriculture:data.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Query export traceability lineage: producer → farm → harvest → lot → export order → shipment → buyer. Read-only.",
    metadata: {
      stableId: "cap-agriculture-export-traceability-query",
      version: "1.0.0",
      ownerRole: "SECTOR_OPERATOR",
      domain: "AGRICULTURE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 10000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ORDER_QUERY,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext, input: unknown) => {
      requireContext();
      const { exportOrderId } = ORDER_QUERY.parse(input ?? {});
      const { traceabilityForExportOrder } = await import("@/lib/agriculture/export");
      try {
        const trace = await traceabilityForExportOrder(exportOrderId, context.target.tenantId);
        const findings: NoeliaFinding[] = [
          { label: "Export order", value: trace.order.code, kind: "FACT", status: "OBSERVED" },
          { label: "Buyer", value: trace.buyer?.name ?? trace.order.buyerId, kind: "FACT", status: "OBSERVED" },
          { label: "Destination", value: `${trace.order.destination ?? ""} ${trace.order.destinationCountryCode}`, kind: "FACT", status: "OBSERVED" },
          { label: "Allocations", value: `${trace.allocations.length} allocation(s)`, kind: "FACT", status: "OBSERVED" },
          { label: "Trace batches", value: `${trace.batches.length} batch(es)`, kind: "FACT", status: "OBSERVED" },
          { label: "Harvests", value: `${trace.harvests.length} harvest(s)`, kind: "FACT", status: "OBSERVED" },
          { label: "Farms", value: `${trace.farms.length} farm(s)`, kind: "FACT", status: "OBSERVED" },
          { label: "Export shipments", value: `${trace.exportShipments.length} shipment(s)`, kind: "FACT", status: "OBSERVED" },
        ];
        return {
          headline: `Traceability for ${trace.order.code}: ${trace.farms.length} farm(s) → ${trace.batches.length} batch(es) → ${trace.exportShipments.length} shipment(s) → ${trace.buyer?.name ?? "buyer"}.`,
          findings,
          narrative: "Lineage reuses existing Agriculture traceability (trace_batches, trace_links, harvests, farms). No second traceability graph. Noelia cannot certify provenance; it reports observed links only.",
          confidence: 0.88,
          metadata: { lineage: trace.lineage },
        };
      } catch {
        return {
          headline: "Traceability query failed: export order not found or not in tenant scope.",
          findings: [{ label: "Traceability", value: "NOT_FOUND", kind: "INFERENCE", status: "UNAVAILABLE" }],
          confidence: 0.4,
        };
      }
    },
  });

  registry.register({
    name: "agriculture.export.compliance.readiness",
    permission: "agriculture:data.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Analyse export compliance readiness: applicable requirements, missing/failed checks, verified status. Read-only; cannot approve or certify.",
    metadata: {
      stableId: "cap-agriculture-export-compliance-readiness",
      version: "1.0.0",
      ownerRole: "SECTOR_OPERATOR",
      domain: "AGRICULTURE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 10000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ORDER_QUERY,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext, input: unknown) => {
      requireContext();
      const { exportOrderId } = ORDER_QUERY.parse(input ?? {});
      const { complianceReadiness, applicableRequirementsForOrder } = await import("@/lib/agriculture/export");
      try {
        const [readiness, applicable] = await Promise.all([
          complianceReadiness(exportOrderId, context.target.tenantId),
          applicableRequirementsForOrder(exportOrderId, context.target.tenantId),
        ]);
        const findings: NoeliaFinding[] = [
          { label: "Applicable requirements", value: `${applicable.length} requirement(s)`, kind: "FACT", status: "OBSERVED" },
          { label: "Compliance ready", value: readiness.ready ? "YES" : "NO", kind: "INFERENCE", status: readiness.ready ? "OBSERVED" : "REQUIRES_HUMAN_REVIEW" },
        ];
        for (const c of readiness.checks) {
          findings.push({
            label: `Check · ${c.requirementId.slice(0, 8)}`,
            value: c.status,
            kind: "FACT",
            status: c.status === "VERIFIED" ? "OBSERVED" : "REQUIRES_HUMAN_REVIEW",
          });
        }
        if (readiness.reasons.length > 0) {
          findings.push({ label: "Blocking reasons", value: readiness.reasons.join(", "), kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" });
        }
        return {
          headline: readiness.ready
            ? `Compliance ready for ${exportOrderId}: ${applicable.length} requirement(s) satisfied.`
            : `Compliance NOT ready for ${exportOrderId}: ${readiness.reasons.length} blocking issue(s).`,
          findings,
          narrative: "Compliance readiness is derived from applicable requirements (country, product, buyer, market). Verification requires human authority; Noelia cannot certify, submit to government, or claim legal compliance.",
          confidence: readiness.ready ? 0.9 : 0.75,
          humanReviewRequired: !readiness.ready,
          metadata: { ready: readiness.ready, reasons: readiness.reasons },
        };
      } catch {
        return {
          headline: "Compliance readiness query failed.",
          findings: [{ label: "Compliance", value: "NOT_FOUND", kind: "INFERENCE", status: "UNAVAILABLE" }],
          confidence: 0.3,
        };
      }
    },
  });

  registry.register({
    name: "agriculture.export.documents.missing",
    permission: "agriculture:data.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Detect missing export documents based on applicable compliance requirements and linked documents. Read-only.",
    metadata: {
      stableId: "cap-agriculture-export-documents-missing",
      version: "1.0.0",
      ownerRole: "SECTOR_OPERATOR",
      domain: "AGRICULTURE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 10000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ORDER_QUERY,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext, input: unknown) => {
      requireContext();
      const { exportOrderId } = ORDER_QUERY.parse(input ?? {});
      const { complianceReadiness, applicableRequirementsForOrder } = await import("@/lib/agriculture/export");
      try {
        const [readiness, applicable] = await Promise.all([
          complianceReadiness(exportOrderId, context.target.tenantId),
          applicableRequirementsForOrder(exportOrderId, context.target.tenantId),
        ]);
        const missing = readiness.checks.filter((c) => c.status === "MISSING" || c.status === "EXPIRED" || c.status === "FAILED");
        const missingDocTypes = missing.map((m) => {
          const req = applicable.find((r) => r.id === m.requirementId);
          return req?.documentType ?? m.requirementId;
        });

        const docLinks = await db
          .select()
          .from(s.exportDocumentLinks)
          .where(and(eq(s.exportDocumentLinks.exportOrderId, exportOrderId), eq(s.exportDocumentLinks.tenantId, context.target.tenantId)));

        const findings: NoeliaFinding[] = [
          { label: "Applicable requirements", value: `${applicable.length}`, kind: "FACT", status: "OBSERVED" },
          { label: "Missing checks", value: `${missing.length}`, kind: "FACT", status: missing.length > 0 ? "REQUIRES_HUMAN_REVIEW" : "OBSERVED" },
          { label: "Linked documents", value: `${docLinks.length}`, kind: "FACT", status: "OBSERVED" },
        ];
        for (const dt of missingDocTypes) {
          findings.push({ label: "Missing document type", value: dt, kind: "INFERENCE", status: "REQUIRES_HUMAN_REVIEW" });
        }

        return {
          headline: missing.length > 0 ? `${missing.length} document(s) missing for ${exportOrderId}.` : `No missing documents detected for ${exportOrderId}.`,
          findings,
          narrative: "Missing-document detection uses compliance requirements and export_document_links. Documents are stored in canonical agriculture_documents; this tool reports gaps only.",
          confidence: 0.82,
          humanReviewRequired: missing.length > 0,
        };
      } catch {
        return {
          headline: "Missing-document detection failed.",
          findings: [{ label: "Documents", value: "NOT_FOUND", kind: "INFERENCE", status: "UNAVAILABLE" }],
          confidence: 0.3,
        };
      }
    },
  });

  registry.register({
    name: "agriculture.export.shipment.exceptions",
    permission: "agriculture:data.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Analyse export shipment exceptions: active holds, delayed shipments, status anomalies. Read-only.",
    metadata: {
      stableId: "cap-agriculture-export-shipment-exceptions",
      version: "1.0.0",
      ownerRole: "SECTOR_OPERATOR",
      domain: "AGRICULTURE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 10000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext) => {
      requireContext();
      try {
        const tenantId = context.target.tenantId;
        const activeHolds = await db.select().from(s.exportHolds).where(and(eq(s.exportHolds.tenantId, tenantId), eq(s.exportHolds.status, "ACTIVE")));
        const onHoldOrders = await db.select().from(s.exportOrders).where(and(eq(s.exportOrders.tenantId, tenantId), eq(s.exportOrders.status, "ON_HOLD")));
        const dispatched = await db
          .select()
          .from(s.exportShipments)
          .where(and(eq(s.exportShipments.tenantId, tenantId), eq(s.exportShipments.status, "DISPATCHED")));

        const findings: NoeliaFinding[] = [
          { label: "Active holds", value: `${activeHolds.length}`, kind: "FACT", status: activeHolds.length > 0 ? "REQUIRES_HUMAN_REVIEW" : "OBSERVED" },
          { label: "On-hold orders", value: `${onHoldOrders.length}`, kind: "FACT", status: onHoldOrders.length > 0 ? "REQUIRES_HUMAN_REVIEW" : "OBSERVED" },
          { label: "In-transit shipments", value: `${dispatched.length}`, kind: "FACT", status: "OBSERVED" },
        ];
        for (const h of activeHolds.slice(0, 10)) {
          findings.push({
            label: `Hold · ${h.holdType}`,
            value: `${h.reason.slice(0, 80)} — order ${h.exportOrderId?.slice(0, 8) ?? "?"}`,
            kind: "FACT",
            status: "REQUIRES_HUMAN_REVIEW",
          });
        }

        return {
          headline: activeHolds.length > 0 ? `${activeHolds.length} active hold(s) and ${onHoldOrders.length} on-hold order(s) require attention.` : "No active shipment exceptions detected.",
          findings,
          narrative: "Shipment exception analysis reports holds and status; it cannot release holds, authorize shipments or submit to government. All holds require explicit human release with reason.",
          confidence: 0.85,
          humanReviewRequired: activeHolds.length > 0 || onHoldOrders.length > 0,
        };
      } catch {
        return {
          headline: "Shipment exception analysis unavailable.",
          findings: [{ label: "Shipment exceptions", value: "UNAVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
          confidence: 0.3,
        };
      }
    },
  });

  registry.register({
    name: "agriculture.export.analytics",
    permission: "agriculture:data.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Operational analytics for Food Export: volumes by destination, product, buyer, status trends. Read-only, no financial truth.",
    metadata: {
      stableId: "cap-agriculture-export-analytics",
      version: "1.0.0",
      ownerRole: "SECTOR_OPERATOR",
      domain: "AGRICULTURE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 10000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext) => {
      requireContext();
      try {
        const tenantId = context.target.tenantId;
        const byDestination = await db
          .select({ country: s.exportOrders.destinationCountryCode, count: sql<number>`count(*)::int`, qty: sql<string>`coalesce(sum(${s.exportOrders.quantity}),0)` })
          .from(s.exportOrders)
          .where(eq(s.exportOrders.tenantId, tenantId))
          .groupBy(s.exportOrders.destinationCountryCode);

        const byProduct = await db
          .select({ productId: s.exportOrders.productId, count: sql<number>`count(*)::int`, qty: sql<string>`coalesce(sum(${s.exportOrders.quantity}),0)` })
          .from(s.exportOrders)
          .where(eq(s.exportOrders.tenantId, tenantId))
          .groupBy(s.exportOrders.productId);

        const findings: NoeliaFinding[] = [];
        for (const r of byDestination) {
          findings.push({
            label: `Volume by destination · ${r.country}`,
            value: `${r.count} order(s), ${Number(r.qty).toLocaleString()} KG`,
            kind: "FACT",
            status: "OBSERVED",
          });
        }
        for (const r of byProduct.slice(0, 10)) {
          findings.push({
            label: `Volume by product · ${r.productId?.slice(0, 8) ?? "unspecified"}`,
            value: `${r.count} order(s), ${Number(r.qty).toLocaleString()} KG`,
            kind: "FACT",
            status: "OBSERVED",
          });
        }

        return {
          headline: `Export analytics: ${byDestination.length} destination(s), ${byProduct.length} product group(s). Operational volumes only.`,
          findings,
          narrative: "Analytics are operational only; Finance OS remains canonical for financial truth. Noelia cannot post journals, execute capital or certify compliance.",
          confidence: 0.8,
        };
      } catch {
        return {
          headline: "Export analytics unavailable.",
          findings: [{ label: "Export analytics", value: "UNAVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
          confidence: 0.3,
        };
      }
    },
  });
}
