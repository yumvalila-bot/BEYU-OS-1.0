/**
 * HL7 v2 safe parser/serializer foundation.
 *
 * Supports segment parsing, field/repetition/component delimiters, MSH/ADT/
 * ORM/ORU families, message IDs, ACK/NACK generation, and malformed-message
 * rejection.
 *
 * Does NOT implement partner-specific profiles. Does NOT validate against
 * clinical content (that is a clinical-safety concern).
 *
 * Encoding characters default to v2 standard: |^~\&
 */

export const HL7_V2_DEFAULTS = {
  segment: "\r",
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};

export interface Hl7Field {
  value: string;
  components: string[];
  repetitions: string[];
}

export interface Hl7Segment {
  name: string;
  fields: Hl7Field[];
  raw: string;
}

export interface Hl7Message {
  segments: Hl7Segment[];
  messageType: string | null;
  messageControlId: string | null;
  sendingApplication: string | null;
  sendingFacility: string | null;
  receivingApplication: string | null;
  receivingFacility: string | null;
  version: string | null;
}

export class Hl7ParseError extends Error {
  constructor(msg: string, public readonly detail?: unknown) { super(`HL7_PARSE: ${msg}`); }
}

export function parseHl7v2(raw: string): Hl7Message {
  if (typeof raw !== "string" || raw.length === 0) throw new Hl7ParseError("empty");
  // Normalize line endings to CR.
  const normalized = raw.replace(/\r?\n/g, "\r");
  const segStrings = normalized.split("\r").filter((s) => s.length >= 3);
  if (segStrings.length === 0) throw new Hl7ParseError("no_segments");
  const segments: Hl7Segment[] = [];
  const enc = HL7_V2_DEFAULTS;
  for (const s of segStrings) {
    const name = s.slice(0, 3);
    if (!/^[A-Z0-9]{2,3}$/.test(name)) throw new Hl7ParseError(`invalid_segment_name:${name}`);
    const rest = s.slice(3);
    if (rest[0] !== enc.field) throw new Hl7ParseError(`missing_field_separator_after_${name}`);
    const fieldStrs = rest.slice(1).split(enc.field);
    const fields: Hl7Field[] = fieldStrs.map((f) => {
      const repetitions = f.split(enc.repetition);
      const components = f.split(enc.component);
      return { value: f, components, repetitions };
    });
    segments.push({ name, fields, raw: s });
  }
  const msh = segments[0];
  if (msh.name !== "MSH") throw new Hl7ParseError("first_segment_must_be_MSH");
  // After splitting on '|' and discarding the leading 'MSH', the field array is
  // indexed as: 0=encoding_chars (MSH-2), 1=sending_app (MSH-3), 2=sending_fac
  // (MSH-4), 3=receiving_app (MSH-5), 4=receiving_fac (MSH-6), 5=datetime
  // (MSH-7), 6=security (MSH-8), 7=message_type (MSH-9), 8=message_control_id
  // (MSH-10), 9=processing_id (MSH-11), 10=version (MSH-12).
  const mtField = msh.fields[7]; // MSH-9
  const mt = mtField?.components[0] ?? null;
  const mci = msh.fields[8]?.value ?? null;
  return {
    segments,
    messageType: mt,
    messageControlId: mci,
    sendingApplication: msh.fields[1]?.components[0] ?? null,
    sendingFacility: msh.fields[2]?.components[0] ?? null,
    receivingApplication: msh.fields[3]?.components[0] ?? null,
    receivingFacility: msh.fields[4]?.components[0] ?? null,
    version: msh.fields[10]?.components[0] ?? null,
  };
}

export function buildAck(messageControlId: string, ackCode: "AA" | "AE" | "AR", text?: string): string {
  // Minimal MSH + MSA ack using standard delimiters.
  const now = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const msh = `MSH|^~\\&|BEYUHealthOS|BEYU|UNKNOWN|UNKNOWN|${now}||ACK^A01|ACK-${messageControlId}|P|2.5`;
  const msa = `MSA|${ackCode}|${messageControlId}|${text ?? ""}`;
  return `${msh}\r${msa}\r`;
}
