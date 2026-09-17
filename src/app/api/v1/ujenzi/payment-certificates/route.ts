/** UJENZI OS — paymentCertificates */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { ujenziListRoute, ujenziCreateRoute, ujenziActor } from "@/lib/ujenzi/http";
import { certifyPaymentCertificate } from "@/lib/ujenzi";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().min(1),
  certificateNo: z.number().int().min(1),
  periodFrom: z.string().optional(),
  periodTo: z.string().optional(),
  grossValue: z.string().min(1),
  retention: z.string().optional(),
  currency: z.string().optional(),
});

export const GET = ujenziListRoute({
  action: "ujenzi.paymentCertificates.list",
  objectType: "UJENZI_PAYMENT_CERTIFICATE",
  load: async (ctx, request) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const conditions = [eq(s.ujenziPaymentCertificates.tenantId, ctx.principal.tenantId)];
    if (projectId) conditions.push(eq(s.ujenziPaymentCertificates.projectId, projectId));
    const rows = await db.select().from(s.ujenziPaymentCertificates).where(and(...conditions));
    return { items: rows };
  },
});

export const POST = ujenziCreateRoute({
  action: "ujenzi.paymentCertificates.create",
  objectType: "UJENZI_PAYMENT_CERTIFICATE",
  schema: CreateSchema,
  create: async (ctx, body) => certifyPaymentCertificate({ ...body, tenantId: ctx.principal.tenantId }, ujenziActor(ctx)),
});
