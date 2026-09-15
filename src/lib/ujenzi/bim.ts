import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { UjenziDomainError } from "./errors";

function id() {
  return newId(ID_PREFIX.ujenzi);
}

export function detectBimFormat(bytes: Buffer): { format: string; supported: boolean; headerHint: string | null } {
  const head = bytes.subarray(0, Math.min(bytes.length, 512)).toString("latin1");
  if (head.startsWith("ISO-10303-21")) {
    const name = head.match(/FILE_NAME\s*\(\s*'([^']*)'/)?.[1] ?? null;
    return { format: "IFC_STEP", supported: true, headerHint: name };
  }
  if (head.includes("ifcXML") || head.includes("iso:std:iso:10303")) {
    return { format: "IFC_XML", supported: true, headerHint: null };
  }
  return { format: "UNSUPPORTED", supported: false, headerHint: null };
}

export async function registerBimArtifact(input: {
  tenantId: string;
  projectId: string;
  code: string;
  discipline?: string;
  bytes: Buffer;
}) {
  const [project] = await db
    .select({ id: s.ujenziProjects.id })
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, input.projectId), eq(s.ujenziProjects.tenantId, input.tenantId)));
  if (!project) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  if (!input.bytes.length) throw new UjenziDomainError("INVALID_STATE", "Empty BIM artifact");
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const detected = detectBimFormat(input.bytes);
  const [dup] = await db
    .select()
    .from(s.ujenziBimArtifacts)
    .where(and(eq(s.ujenziBimArtifacts.tenantId, input.tenantId), eq(s.ujenziBimArtifacts.checksum, checksum)))
    .limit(1);
  if (dup) {
    return {
      id: dup.id,
      duplicate: true as const,
      checksum,
      format: dup.format,
      supported: dup.format !== "UNSUPPORTED",
      geometryParsed: false as const,
      viewer: "NOT_IMPLEMENTED" as const,
    };
  }
  const artifactId = id();
  await db.insert(s.ujenziBimArtifacts).values({
    id: artifactId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    discipline: input.discipline ?? "ARCHITECTURE",
    format: detected.format,
    checksum,
    byteSize: input.bytes.length,
    headerHint: detected.headerHint,
    ingestStatus: detected.supported ? "REGISTERED" : "UNSUPPORTED_FORMAT",
    geometryParsed: false,
  });
  const [maxRev] = await db
    .select()
    .from(s.ujenziBimModels)
    .where(and(eq(s.ujenziBimModels.projectId, input.projectId), eq(s.ujenziBimModels.code, input.code)));
  if (!maxRev) {
    await db.insert(s.ujenziBimModels).values({
      id: id(),
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      format: detected.format,
      version: "1",
      federationStatus: "UNFEDERATED",
    });
  }
  return {
    id: artifactId,
    duplicate: false as const,
    checksum,
    format: detected.format,
    byteSize: input.bytes.length,
    supported: detected.supported,
    geometryParsed: false as const,
    viewer: "NOT_IMPLEMENTED" as const,
    headerHint: detected.headerHint,
  };
}

export async function verifyBimChecksum(tenantId: string, artifactId: string, bytes: Buffer) {
  const [row] = await db
    .select()
    .from(s.ujenziBimArtifacts)
    .where(and(eq(s.ujenziBimArtifacts.id, artifactId), eq(s.ujenziBimArtifacts.tenantId, tenantId)));
  if (!row) throw new UjenziDomainError("NOT_FOUND", "BIM artifact not found");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return { match: checksum === row.checksum, expected: row.checksum, actual: checksum };
}
