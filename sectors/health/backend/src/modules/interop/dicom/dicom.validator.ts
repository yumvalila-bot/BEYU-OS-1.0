/**
 * DICOM metadata validator (internal architecture).
 *
 * Validates:
 *   - UID structure (StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID) per DICOM PS3.5
 *   - Accession number presence
 *   - Modality presence
 *   - Patient identity linkage (PatientID + PatientName)
 *   - Equipment linkage (StationName / Manufacturer / Model)
 *   - Report linkage (ReferencedSOPSequence when present)
 *
 * Does NOT perform pixel validation, JPEG/LS codecs, or PACS C-FIND/C-MOVE.
 * PACS adapter remains EXTERNAL-BLOCKED; this module validates metadata only.
 *
 * No live PACS connectivity is claimed.
 */

// DICOM UID: digits separated by dots, 1-64 chars, components non-zero-leading.
const DICOM_UID_RE = /^[0-9]([0-9]*(?:\.[0-9]+)*)?$/;
const MAX_UID_LEN = 64;

export interface DicomMetadata {
  studyInstanceUid: string;
  seriesInstanceUid?: string | null;
  sopInstanceUid?: string | null;
  accessionNumber?: string | null;
  modality?: string | null;
  patientId: string;
  patientName?: string | null;
  stationName?: string | null;
  manufacturer?: string | null;
  manufacturerModelName?: string | null;
  radiationDose?: {
    doseLengthProduct?: number | null;
    ctdivol?: number | null;
    unit?: "mGy.cm" | "mGy" | string;
  } | null;
  referencedReports?: Array<{ sopInstanceUid: string; sopClassUid?: string }>;
}

export interface DicomValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateDicomUid(uid: string): string | null {
  if (typeof uid !== "string") return "uid_not_string";
  if (uid.length === 0) return "uid_empty";
  if (uid.length > MAX_UID_LEN) return `uid_too_long:${uid.length}>${MAX_UID_LEN}`;
  if (!DICOM_UID_RE.test(uid)) return "uid_invalid_chars";
  const parts = uid.split(".");
  for (const p of parts) {
    if (p.length > 1 && p.startsWith("0")) return "uid_leading_zero";
  }
  return null;
}

export function validateDicomMetadata(meta: DicomMetadata): DicomValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const studyErr = validateDicomUid(meta.studyInstanceUid);
  if (studyErr) errors.push(`StudyInstanceUID:${studyErr}`);
  if (meta.seriesInstanceUid) {
    const e = validateDicomUid(meta.seriesInstanceUid);
    if (e) errors.push(`SeriesInstanceUID:${e}`);
  }
  if (meta.sopInstanceUid) {
    const e = validateDicomUid(meta.sopInstanceUid);
    if (e) errors.push(`SOPInstanceUID:${e}`);
  }
  if (!meta.patientId || typeof meta.patientId !== "string") errors.push("patientId_required");
  if (!meta.patientName) warnings.push("patientName_missing");
  if (!meta.accessionNumber) warnings.push("accessionNumber_missing");
  if (!meta.modality) warnings.push("modality_missing");
  if (!meta.stationName && !meta.manufacturer) warnings.push("equipment_linkage_missing");
  if (meta.radiationDose && meta.radiationDose.ctdivol != null && meta.radiationDose.ctdivol < 0) {
    errors.push("dose_negative_ctdivol");
  }
  if (meta.referencedReports) {
    for (let i = 0; i < meta.referencedReports.length; i++) {
      const ref = meta.referencedReports[i];
      const e = validateDicomUid(ref.sopInstanceUid);
      if (e) errors.push(`referencedReport[${i}].sopInstanceUid:${e}`);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
