import { Badge, Panel } from "@/components/brand";
import {
  getForestProduceRegulationControls,
  getTanzaniaTaxSubsidiaryInstruments,
} from "@/lib/finance/tanzania-subsidiary-legislation";

/**
 * Read-only verification dossier. Reproduced text is explicitly provisional.
 */
export function TanzaniaSubsidiaryLegislationReview() {
  const instruments = getTanzaniaTaxSubsidiaryInstruments();
  const controls = getForestProduceRegulationControls();

  return (
    <Panel kicker="Subsidiary legislation · source verification" title="Tanzania tax regulations & Gazette review">
      <div className="space-y-3">
        <p className="text-[11px] beyu-muted">
          Discovery and legal cross-check only. No instrument in this panel has been ingested
          into governed knowledge or activated as a tax rule.
        </p>
        {instruments.map((instrument) => (
          <article key={instrument.code} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold">{instrument.title}</span>
              <Badge tone={instrument.sourceStatus === "OFFICIAL_OAG_PDF_AVAILABLE_NOT_STORED_OR_CHECKSUMMED" ? "amber" : "slate"}>
                {instrument.governmentNotice}
              </Badge>
              <Badge tone="slate">
                {instrument.sourceStatus === "OFFICIAL_OAG_PDF_AVAILABLE_NOT_STORED_OR_CHECKSUMMED"
                  ? "OAG PDF available · checksum pending"
                  : instrument.sourceStatus === "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED"
                    ? "Official metadata · text pending"
                    : "Reproduced copy · Gazette match pending"}
              </Badge>
            </div>
            <div className="mt-2 grid gap-1 text-[10px] sm:grid-cols-2">
              <div><span className="beyu-muted">Published: </span>{instrument.publicationDate}</div>
              <div><span className="beyu-muted">Commences: </span>{instrument.commencementDate}</div>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[10.5px] beyu-muted">
              {instrument.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3 text-[10.5px]">
              {instrument.officialPdfUri && (
                <a className="underline underline-offset-2" href={instrument.officialPdfUri} target="_blank" rel="noreferrer">
                  Official OAG PDF
                </a>
              )}
              {instrument.officialMetadataUri && (
                <a className="underline underline-offset-2" href={instrument.officialMetadataUri} target="_blank" rel="noreferrer">
                  OAG official metadata
                </a>
              )}
              {instrument.reproducedTextUris.map((uri) => (
                <a key={uri} className="underline underline-offset-2" href={uri} target="_blank" rel="noreferrer">
                  Reproduced text
                </a>
              ))}
            </div>
            {instrument.supportingAnalysisUris && instrument.supportingAnalysisUris.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-3 text-[10.5px]">
                {instrument.supportingAnalysisUris.map((uri) => (
                  <a key={uri} className="underline underline-offset-2" href={uri} target="_blank" rel="noreferrer">
                    Professional analysis
                  </a>
                ))}
              </div>
            )}
            <p className="mt-2 text-[9.5px] beyu-muted">
              Not ingested · NOELIA reliance blocked pending official source acquisition and specialist review
            </p>
          </article>
        ))}

        <div className="border-t border-[color:var(--beyu-line)] pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold">GN 158F · forest-produce regulation clause review</span>
            <Badge tone="amber">Provisional transcription</Badge>
          </div>
          <p className="mb-3 text-[10.5px] beyu-muted">
            Cross-checked conceptually against Income Tax Act section 116A as replaced by Finance Act No. 2 of 2026, section 25.
            The statutory text is available from the official OAG Act PDF; the regulation text below remains unauthenticated.
          </p>
          <div className="space-y-3">
            {controls.map((control) => (
              <article key={control.regulation} className="border-t border-[color:var(--beyu-line)] pt-2">
                <div className="text-[10.5px] font-semibold">Regulation {control.regulation} · {control.subject}</div>
                <p className="mt-1 text-[10.5px]">{control.reproducedTextSummary}</p>
                <p className="mt-1 text-[10px] beyu-muted">Legal cross-check: {control.legalCrossCheck}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
