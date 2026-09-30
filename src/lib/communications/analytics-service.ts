/**
 * Communications Analytics & Cost Intelligence
 *
 * Metrics: sent, received, delivered, failed, read, response time,
 * resolution time, active conversations, human handoffs, SLA compliance,
 * opt-outs, provider failures, retries, channel usage, feedback response,
 * template usage, journey completion.
 *
 * Respect tenant/entity/classification access.
 *
 * Cost Intelligence is NOT accounting — it tracks provider billing info for
 * visibility, not ledger posting. Do not create another Finance ledger.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  communicationAnalyticsDaily,
  communicationMessages,
  communicationConversations,
  communicationCostLedger,
  communicationProviders,
} from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";

export type AnalyticsRecord = typeof communicationAnalyticsDaily.$inferSelect;

export async function getDailyAnalytics(
  tenantId: string,
  date: string, // YYYY-MM-DD
  channel?: string,
): Promise<AnalyticsRecord[]> {
  let query = db
    .select()
    .from(communicationAnalyticsDaily)
    .where(and(eq(communicationAnalyticsDaily.tenantId, tenantId), eq(communicationAnalyticsDaily.date, date)))
    .$dynamic();

  if (channel) {
    query = db
      .select()
      .from(communicationAnalyticsDaily)
      .where(
        and(
          eq(communicationAnalyticsDaily.tenantId, tenantId),
          eq(communicationAnalyticsDaily.date, date),
          eq(communicationAnalyticsDaily.channel, channel),
        ),
      ) as unknown as typeof query;
  }

  return query;
}

export async function getAnalyticsSummary(
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<{
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalRead: number;
  totalInbound: number;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
  byChannel: Record<string, { sent: number; delivered: number; failed: number; read: number }>;
  totalEstimatedCost: number;
  totalActualCost: number;
}> {
  const rows = await db.execute(
    sql`SELECT channel, 
               SUM(sent_count) as sent, 
               SUM(delivered_count) as delivered,
               SUM(failed_count) as failed,
               SUM(read_count) as read,
               SUM(inbound_count) as inbound,
               SUM(total_estimated_cost) as est_cost,
               SUM(total_actual_cost) as actual_cost
        FROM communication_analytics_daily
        WHERE tenant_id = ${tenantId} AND date >= ${fromDate} AND date <= ${toDate}
        GROUP BY channel`,
  );

  let totalSent = 0;
  let totalDelivered = 0;
  let totalFailed = 0;
  let totalRead = 0;
  let totalInbound = 0;
  let totalEstimatedCost = 0;
  let totalActualCost = 0;
  const byChannel: Record<string, { sent: number; delivered: number; failed: number; read: number }> = {};

  for (const row of rows.rows as unknown as {
    channel: string;
    sent: string;
    delivered: string;
    failed: string;
    read: string;
    inbound: string;
    est_cost: string;
    actual_cost: string;
  }[]) {
    const sent = Number(row.sent ?? 0);
    const delivered = Number(row.delivered ?? 0);
    const failed = Number(row.failed ?? 0);
    const read = Number(row.read ?? 0);
    const inbound = Number(row.inbound ?? 0);
    totalSent += sent;
    totalDelivered += delivered;
    totalFailed += failed;
    totalRead += read;
    totalInbound += inbound;
    totalEstimatedCost += Number(row.est_cost ?? 0);
    totalActualCost += Number(row.actual_cost ?? 0);
    byChannel[row.channel] = { sent, delivered, failed, read };
  }

  const deliveryRate = totalSent > 0 ? totalDelivered / totalSent : 0;
  const readRate = totalDelivered > 0 ? totalRead / totalDelivered : 0;
  const failureRate = totalSent > 0 ? totalFailed / totalSent : 0;

  return {
    totalSent,
    totalDelivered,
    totalFailed,
    totalRead,
    totalInbound,
    deliveryRate,
    readRate,
    failureRate,
    byChannel,
    totalEstimatedCost,
    totalActualCost,
  };
}

export async function upsertDailyAnalytics(input: {
  tenantId: string;
  date: string;
  channel: string;
  providerId?: string | null;
  countryCode?: string | null;
  messageType?: string | null;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  failedCount?: number;
  bouncedCount?: number;
  inboundCount?: number;
  avgResponseTimeSeconds?: number | null;
  avgResolutionTimeSeconds?: number | null;
  totalEstimatedCost?: number;
  totalActualCost?: number;
  costCurrency?: string;
}): Promise<AnalyticsRecord> {
  const id = newId(ID_PREFIX.commAnalytics);
  const [row] = await db
    .insert(communicationAnalyticsDaily)
    .values({
      id,
      tenantId: input.tenantId,
      date: input.date,
      channel: input.channel,
      providerId: input.providerId,
      countryCode: input.countryCode,
      messageType: input.messageType,
      sentCount: input.sentCount ?? 0,
      deliveredCount: input.deliveredCount ?? 0,
      readCount: input.readCount ?? 0,
      failedCount: input.failedCount ?? 0,
      bouncedCount: input.bouncedCount ?? 0,
      inboundCount: input.inboundCount ?? 0,
      avgResponseTimeSeconds: input.avgResponseTimeSeconds ? String(input.avgResponseTimeSeconds) as never : null,
      avgResolutionTimeSeconds: input.avgResolutionTimeSeconds ? String(input.avgResolutionTimeSeconds) as never : null,
      totalEstimatedCost: String(input.totalEstimatedCost ?? 0) as never,
      totalActualCost: String(input.totalActualCost ?? 0) as never,
      costCurrency: input.costCurrency ?? "USD",
    })
    .onConflictDoUpdate({
      target: [
        communicationAnalyticsDaily.tenantId,
        communicationAnalyticsDaily.date,
        communicationAnalyticsDaily.channel,
        communicationAnalyticsDaily.messageType,
      ],
      set: {
        sentCount: sql`${communicationAnalyticsDaily.sentCount} + ${input.sentCount ?? 0}`,
        deliveredCount: sql`${communicationAnalyticsDaily.deliveredCount} + ${input.deliveredCount ?? 0}`,
        readCount: sql`${communicationAnalyticsDaily.readCount} + ${input.readCount ?? 0}`,
        failedCount: sql`${communicationAnalyticsDaily.failedCount} + ${input.failedCount ?? 0}`,
        bouncedCount: sql`${communicationAnalyticsDaily.bouncedCount} + ${input.bouncedCount ?? 0}`,
        inboundCount: sql`${communicationAnalyticsDaily.inboundCount} + ${input.inboundCount ?? 0}`,
        totalEstimatedCost: sql`${communicationAnalyticsDaily.totalEstimatedCost} + ${input.totalEstimatedCost ?? 0}`,
        totalActualCost: sql`${communicationAnalyticsDaily.totalActualCost} + ${input.totalActualCost ?? 0}`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function getCostIntelligence(
  tenantId: string,
  fromDate?: string,
  toDate?: string,
): Promise<{
  byChannel: Record<string, { estimated: number; actual: number; count: number }>;
  byProvider: Record<string, { estimated: number; actual: number; count: number }>;
  byCountry: Record<string, { estimated: number; actual: number; count: number }>;
  totalEstimated: number;
  totalActual: number;
}> {
  // Cost intelligence query — NOT accounting
  const rows = await db.execute(
    sql`SELECT channel, provider_id, country_code, 
               SUM(estimated_cost) as est, 
               SUM(actual_cost) as actual,
               COUNT(*) as cnt
        FROM communication_cost_ledger
        WHERE tenant_id = ${tenantId}
        GROUP BY channel, provider_id, country_code`,
  );

  const byChannel: Record<string, { estimated: number; actual: number; count: number }> = {};
  const byProvider: Record<string, { estimated: number; actual: number; count: number }> = {};
  const byCountry: Record<string, { estimated: number; actual: number; count: number }> = {};
  let totalEstimated = 0;
  let totalActual = 0;

  for (const row of rows.rows as unknown as {
    channel: string;
    provider_id: string | null;
    country_code: string | null;
    est: string;
    actual: string;
    cnt: string;
  }[]) {
    const est = Number(row.est ?? 0);
    const actual = Number(row.actual ?? 0);
    const cnt = Number(row.cnt ?? 0);
    totalEstimated += est;
    totalActual += actual;

    if (!byChannel[row.channel]) byChannel[row.channel] = { estimated: 0, actual: 0, count: 0 };
    byChannel[row.channel].estimated += est;
    byChannel[row.channel].actual += actual;
    byChannel[row.channel].count += cnt;

    if (row.provider_id) {
      if (!byProvider[row.provider_id]) byProvider[row.provider_id] = { estimated: 0, actual: 0, count: 0 };
      byProvider[row.provider_id].estimated += est;
      byProvider[row.provider_id].actual += actual;
      byProvider[row.provider_id].count += cnt;
    }

    if (row.country_code) {
      if (!byCountry[row.country_code]) byCountry[row.country_code] = { estimated: 0, actual: 0, count: 0 };
      byCountry[row.country_code].estimated += est;
      byCountry[row.country_code].actual += actual;
      byCountry[row.country_code].count += cnt;
    }
  }

  return { byChannel, byProvider, byCountry, totalEstimated, totalActual };
}

export async function getConversationMetrics(tenantId: string): Promise<{
  open: number;
  botActive: number;
  humanRequired: number;
  humanActive: number;
  waitingCustomer: number;
  resolved: number;
  closed: number;
  total: number;
}> {
  const rows = await db.execute(
    sql`SELECT status, COUNT(*) as cnt FROM communication_conversations WHERE tenant_id = ${tenantId} GROUP BY status`,
  );

  const metrics = {
    open: 0,
    botActive: 0,
    humanRequired: 0,
    humanActive: 0,
    waitingCustomer: 0,
    resolved: 0,
    closed: 0,
    total: 0,
  };

  for (const row of rows.rows as unknown as { status: string; cnt: string }[]) {
    const cnt = Number(row.cnt);
    metrics.total += cnt;
    switch (row.status) {
      case "OPEN":
        metrics.open = cnt;
        break;
      case "BOT_ACTIVE":
        metrics.botActive = cnt;
        break;
      case "HUMAN_REQUIRED":
        metrics.humanRequired = cnt;
        break;
      case "HUMAN_ACTIVE":
        metrics.humanActive = cnt;
        break;
      case "WAITING_CUSTOMER":
        metrics.waitingCustomer = cnt;
        break;
      case "RESOLVED":
        metrics.resolved = cnt;
        break;
      case "CLOSED":
        metrics.closed = cnt;
        break;
    }
  }

  return metrics;
}
