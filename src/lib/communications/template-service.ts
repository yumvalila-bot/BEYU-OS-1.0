/**
 * Template Engine — versioned, approved, localized, classified.
 *
 * Supports: WhatsApp templates, SMS templates, Email templates, In-app, Internal.
 * Features: versioning, approval, localization, country, channel, message type,
 * variables, preview, test rendering, classification.
 * Provider-specific template requirements must be respected.
 */

import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { communicationTemplates } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { TemplateCategory, TemplateStatus } from "./types";

export type TemplateRecord = typeof communicationTemplates.$inferSelect;

export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
): { rendered: string; missingVariables: string[] } {
  const missing: string[] = [];
  let rendered = template;

  // Find all {{variable}} patterns
  const varRegex = /\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g;
  const matches = [...template.matchAll(varRegex)];

  for (const match of matches) {
    const varName = match[1];
    const value = getNestedValue(variables, varName);
    if (value === undefined || value === null) {
      missing.push(varName);
      // Keep placeholder for preview, but mark missing
      rendered = rendered.replace(match[0], `[MISSING:${varName}]`);
    } else {
      rendered = rendered.replace(match[0], String(value));
    }
  }

  return { rendered, missingVariables: missing };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export async function getTemplateById(id: string): Promise<TemplateRecord | null> {
  const [row] = await db.select().from(communicationTemplates).where(eq(communicationTemplates.id, id)).limit(1);
  return row ?? null;
}

export async function getTemplateByCode(
  code: string,
  options?: { tenantId?: string; channel?: string; language?: string; countryCode?: string },
): Promise<TemplateRecord | null> {
  const { or, isNull, and } = await import("drizzle-orm");
  let query = db.select().from(communicationTemplates).where(eq(communicationTemplates.code, code)).$dynamic();

  if (options?.tenantId) {
    query = db
      .select()
      .from(communicationTemplates)
      .where(
        and(
          eq(communicationTemplates.code, code),
          or(eq(communicationTemplates.tenantId, options.tenantId), isNull(communicationTemplates.tenantId)),
        ),
      ) as unknown as typeof query;
  }

  const rows = await query.orderBy(desc(communicationTemplates.createdAt)).limit(20);

  if (rows.length === 0) return null;

  // Prefer exact match on channel, language, country
  if (options?.channel && options?.language && options?.countryCode) {
    const exact = rows.find(
      (r) => r.channel === options.channel && r.language === options.language && r.countryCode === options.countryCode,
    );
    if (exact) return exact;
  }
  if (options?.channel && options?.language) {
    const langChannel = rows.find((r) => r.channel === options.channel && r.language === options.language);
    if (langChannel) return langChannel;
  }
  if (options?.language && options?.countryCode) {
    const langCountry = rows.find((r) => r.language === options.language && r.countryCode === options.countryCode);
    if (langCountry) return langCountry;
  }
  if (options?.language) {
    const lang = rows.find((r) => r.language === options.language);
    if (lang) return lang;
  }
  if (options?.channel) {
    const ch = rows.find((r) => r.channel === options.channel || r.channel === "ALL");
    if (ch) return ch;
  }

  return rows[0];
}

export async function listTemplates(tenantId?: string, channel?: string, category?: string): Promise<TemplateRecord[]> {
  let query = db.select().from(communicationTemplates).$dynamic();
  const conditions: ReturnType<typeof eq>[] = [];
  if (tenantId) {
    const { or, isNull } = await import("drizzle-orm");
    query = db
      .select()
      .from(communicationTemplates)
      .where(or(eq(communicationTemplates.tenantId, tenantId), isNull(communicationTemplates.tenantId))) as unknown as typeof query;
    if (channel) {
      const { and, or, isNull } = await import("drizzle-orm");
      query = db
        .select()
        .from(communicationTemplates)
        .where(
          and(
            or(eq(communicationTemplates.tenantId, tenantId), isNull(communicationTemplates.tenantId)),
            eq(communicationTemplates.channel, channel),
          ),
        ) as unknown as typeof query;
    }
    if (category) {
      const { and, or, isNull } = await import("drizzle-orm");
      query = db
        .select()
        .from(communicationTemplates)
        .where(
          and(
            or(eq(communicationTemplates.tenantId, tenantId), isNull(communicationTemplates.tenantId)),
            eq(communicationTemplates.category, category),
          ),
        ) as unknown as typeof query;
    }
  } else {
    if (channel) {
      query = db.select().from(communicationTemplates).where(eq(communicationTemplates.channel, channel)) as unknown as typeof query;
    }
    if (category) {
      query = db.select().from(communicationTemplates).where(eq(communicationTemplates.category, category)) as unknown as typeof query;
    }
  }
  return query;
}

export async function createTemplate(input: {
  tenantId?: string | null;
  code: string;
  version?: string;
  channel: string;
  category: string;
  name: string;
  description?: string;
  subjectTemplate?: string;
  bodyTemplate: string;
  htmlTemplate?: string;
  variables?: string[];
  requiredVariables?: string[];
  language?: string;
  countryCode?: string | null;
  classification?: string;
  createdBy: string;
}): Promise<TemplateRecord> {
  const id = newId("TMPL" as keyof typeof ID_PREFIX);
  const [row] = await db
    .insert(communicationTemplates)
    .values({
      id,
      tenantId: input.tenantId,
      code: input.code,
      version: input.version ?? "1.0.0",
      channel: input.channel,
      category: input.category,
      name: input.name,
      description: input.description,
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
      htmlTemplate: input.htmlTemplate,
      variables: input.variables ?? [],
      requiredVariables: input.requiredVariables ?? [],
      language: input.language ?? "en",
      countryCode: input.countryCode,
      classification: (input.classification as never) ?? "INTERNAL",
      status: "DRAFT",
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function approveTemplate(id: string, approvedBy: string, approvalRef: string): Promise<TemplateRecord | null> {
  const [row] = await db
    .update(communicationTemplates)
    .set({
      status: "APPROVED",
      approvedBy,
      approvalRef,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(communicationTemplates.id, id))
    .returning();
  return row ?? null;
}

export async function previewTemplate(
  templateId: string,
  variables: Record<string, unknown>,
): Promise<{ subject: string; body: string; html: string | null; missing: string[] } | null> {
  const template = await getTemplateById(templateId);
  if (!template) return null;

  const subjectResult = template.subjectTemplate ? renderTemplate(template.subjectTemplate, variables) : { rendered: "", missingVariables: [] };
  const bodyResult = renderTemplate(template.bodyTemplate, variables);
  const htmlResult = template.htmlTemplate ? renderTemplate(template.htmlTemplate, variables) : null;

  const allMissing = [...new Set([...subjectResult.missingVariables, ...bodyResult.missingVariables, ...(htmlResult?.missingVariables ?? [])])];

  return {
    subject: subjectResult.rendered,
    body: bodyResult.rendered,
    html: htmlResult?.rendered ?? null,
    missing: allMissing,
  };
}
