import "reflect-metadata";
import { parseHl7v2, buildAck, Hl7ParseError } from "./hl7v2.parser";

const SAMPLE_ADT = `MSH|^~\\&|SENDINGAPP|SENDFAC|RECVAPP|RECVFAC|20240101120000||ADT^A01|MSG123|P|2.5\rPID|1||MRN1||DOE^JOHN||19800101|M`;

describe("HL7 v2 parser", () => {
  it("parses a valid ADT^A01 message", () => {
    const m = parseHl7v2(SAMPLE_ADT);
    expect(m.messageType).toBe("ADT");
    expect(m.messageControlId).toBe("MSG123");
    expect(m.segments.map((s) => s.name)).toEqual(["MSH", "PID"]);
  });

  it("rejects empty/non-MSH-first messages", () => {
    expect(() => parseHl7v2("")).toThrow(Hl7ParseError);
    expect(() => parseHl7v2("PID|1||MRN1\r")).toThrow(/MSH/);
  });

  it("builds an ACK/NACK", () => {
    const ack = buildAck("MSG123", "AA");
    expect(ack).toContain("MSH|");
    expect(ack).toContain("MSA|AA|MSG123");
  });
});
