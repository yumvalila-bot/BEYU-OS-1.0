/**
 * BEYU OS — VISUALIZATION EXPORT LAYER (shared capability, §31).
 *
 * Governed export formats over an ALREADY-GOVERNED scene manifest:
 *   • JSON — the manifest itself (allowlist projection);
 *   • CSV  — the accessible table (deterministic, quoted, CRLF-safe);
 *   • SVG  — client-rendered from the same governed manifest (the server
 *            records the export ledger entry + hash of the source manifest;
 *            the pixels/paths are the client renderer's deterministic output);
 *   • PNG/PDF — client-side rasterization/print of the same SVG surface.
 *            NOT_IMPLEMENTED server-side: no server screenshot pipeline
 *            exists, so none is claimed (§43 honesty).
 *   • IFC / domain-specific formats — NOT_IMPLEMENTED. No IFC/BIM geometry
 *            parser exists in this repository; declaring one would be a lie.
 *
 * EXPORT GOVERNANCE INVARIANTS
 * ────────────────────────────
 *   1. An authorized VIEWER is NOT automatically authorized to EXPORT: the
 *      export path requires the separate `viz:export` permission.
 *   2. Exports run over the manifest — the SAME allowlist projection the
 *      screen receives. An export can never contain fields the UI withheld.
 *   3. Every export produces a ledger row (viz_exports) with a sha256 of the
 *      exported content + audit entry + enterprise event: sensitive exports
 *      are always reconstructible evidence.
 *   4. Deep-link/export URLs are never authorization (§21): the guarded()
 *      boundary re-resolves the principal on every export request.
 */
import { createHash } from "node:crypto";
import type { SceneManifest } from "./scene-model";

export const EXPORT_FORMATS = ["JSON", "CSV"] as const;
/** Formats the architecture declares but this repository does not implement
 * server-side today. Listed honestly for the capability matrix + tests. */
export const EXPORT_FORMAT_STATUS: Record<string, "IMPLEMENTED" | "CLIENT_SIDE" | "NOT_IMPLEMENTED"> = {
  JSON: "IMPLEMENTED",
  CSV: "IMPLEMENTED",
  SVG: "CLIENT_SIDE",
  PNG: "CLIENT_SIDE",
  PDF: "CLIENT_SIDE",
  IFC: "NOT_IMPLEMENTED",
};
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** RFC-4180-ish CSV: quote everything, escape embedded quotes. Deterministic
 * from the manifest so the recorded hash is reproducible evidence. */
export function manifestToCsv(manifest: SceneManifest): string {
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const lines = [manifest.accessibleTable.columns.map(escape).join(",")];
  for (const row of manifest.accessibleTable.rows) lines.push(row.map((cell) => escape(String(cell))).join(","));
  return lines.join("\n");
}

/** JSON export: the governed manifest verbatim (it is already an allowlist). */
export function manifestToJson(manifest: SceneManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export type ExportArtifact = {
  format: ExportFormat;
  content: string;
  /** sha256 of the exact exported bytes — recorded in the ledger. */
  contentHash: string;
  byteSize: number;
  rowCount: number;
  filename: string;
};

export function buildExportArtifact(manifest: SceneManifest, format: ExportFormat, exportId: string): ExportArtifact {
  const content = format === "CSV" ? manifestToCsv(manifest) : manifestToJson(manifest);
  const extension = format === "CSV" ? "csv" : "json";
  const safeName = manifest.name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "beyu_scene";
  return {
    format,
    content,
    contentHash: createHash("sha256").update(content, "utf8").digest("hex"),
    byteSize: Buffer.byteLength(content, "utf8"),
    rowCount: manifest.accessibleTable.rows.length,
    filename: `beyu-${safeName}-${exportId}.${extension}`,
  };
}

/** Content-disposition helper: filenames are ASCII-safe by construction so no
 * header-injection character can ever reach a response header. */
export function contentDisposition(artifact: ExportArtifact): string {
  const safe = artifact.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return `attachment; filename="${safe}"`;
}
