import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { UjenziDomainError } from "./errors";

const SOURCES = new Set(["BIM_OBJECT", "DRAWING", "SURVEY", "CALCULATION", "MANUAL", "APPROVED_DATASET"]);

export async function recordBoqItem(input: {
  tenantId: string;
  projectId: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: string;
  sourceKind: string;
  sourceId?: string;
  rate?: string;
}) {
  if (!SOURCES.has(input.sourceKind)) {
    throw new UjenziDomainError("INVALID_STATE", "BOQ quantity requires a known sourceKind");
  }
  if (input.sourceKind !== "MANUAL" && !input.sourceId) {
    throw new UjenziDomainError("DATA_REQUIRED", "Non-manual BOQ items require sourceId provenance");
  }
  const [p] = await db
    .select({ id: s.ujenziProjects.id })
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, input.projectId), eq(s.ujenziProjects.tenantId, input.tenantId)));
  if (!p) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  const qty = Number(input.quantity);
  if (!(qty >= 0) || !Number.isFinite(qty)) throw new UjenziDomainError("INVALID_STATE", "Invalid quantity");
  const amount = input.rate ? String(qty * Number(input.rate)) : null;
  const rowId = newId(ID_PREFIX.ujenzi);
  await db.insert(s.ujenziBoqItems).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    itemCode: input.itemCode,
    description: input.description,
    unit: input.unit,
    quantity: input.quantity,
    rate: input.rate,
    amount,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    journalsPosted: false,
  });
  return { id: rowId, amount, journalsPosted: false as const, capPosting: "LOCKED" as const };
}
