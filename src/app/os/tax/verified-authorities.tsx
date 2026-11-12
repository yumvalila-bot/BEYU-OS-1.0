import { Badge, Panel } from "@/components/brand";
import { getVerifiedTaxAuthorities } from "@/lib/finance/verified-tax-authorities";

/**
 * Official-source register for the 2026 legislative transition.
 * Read-only: linked source discovery is not governed knowledge ingestion.
 */
export function VerifiedTaxAuthorities() {
  const records = getVerifiedTaxAuthorities();

  return (
    <Panel kicker="Verified primary-source metadata" title="Tanzania Finance legislation · 2026">
      <div className="space-y-3">
        <p className="text-[11px] beyu-muted">
          The enacted Act and the earlier Bill are separate legal instruments. The Bill is retained
          for legislative history only and must never be treated as operative law.
        </p>
        {records.map((record) => (
          <article key={record.code} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold">{record.title}</span>
              <Badge tone={record.status === "ENACTED" ? "green" : "amber"}>
                {record.status === "ENACTED" ? "Enacted Act" : "Bill · not law"}
              </Badge>
              <Badge tone="slate">Not ingested</Badge>
            </div>
            <div className="mt-2 grid gap-1 text-[10.5px] sm:grid-cols-2">
              <div><span className="beyu-muted">Publication: </span>{record.publicationDate}</div>
              {record.enactmentDate && <div><span className="beyu-muted">Enactment: </span>{record.enactmentDate}</div>}
              {record.commencementDate && <div><span className="beyu-muted">Commencement: </span>{record.commencementDate}</div>}
              {record.enactmentNumber && <div><span className="beyu-muted">Enactment number: </span>{record.enactmentNumber}</div>}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[10.5px] beyu-muted">
              {record.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3 text-[10.5px]">
              <a className="underline underline-offset-2" href={record.officialMetadataUri} target="_blank" rel="noreferrer">
                Official metadata
              </a>
              <a className="underline underline-offset-2" href={record.officialDocumentUri} target="_blank" rel="noreferrer">
                Official document
              </a>
            </div>
            <p className="mt-2 text-[9.5px] beyu-muted">
              NOELIA reliance: blocked pending governed ingestion, checksum verification and specialist review
            </p>
          </article>
        ))}
      </div>
    </Panel>
  );
}
