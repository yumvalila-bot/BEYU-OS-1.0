import { useState } from "react";
import { I } from "./Icons";
import { BEYU_DOCS, DOC_TYPE_ICON, type BeyuDoc, type DocModule } from "../data/documents";

const STATUS_STYLE: Record<BeyuDoc["status"], string> = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Signed: "bg-navy-50 text-navy-700 border-navy-200",
  "Pending Signature": "bg-gold-50 text-gold-800 border-gold-200",
  Expiring: "bg-amber-50 text-amber-700 border-amber-200",
};

/* ─────────────────────────── Modal Viewer ─────────────────────────── */

export function DocumentViewer({ doc, onClose }: { doc: BeyuDoc | null; onClose: () => void }) {
  if (!doc) return null;
  const Icon = I[DOC_TYPE_ICON[doc.type] as keyof typeof I] || I.doc;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-navy-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-3xl bg-white h-full flex flex-col slidein shadow-2xl">
        {/* header */}
        <div className="px-6 py-4 bg-navy-800 text-white flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gold-500 flex items-center justify-center shrink-0">
            <Icon size={20} stroke="#0B1D3A" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] text-gold-300">{doc.id}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[doc.status]}`}>{doc.status}</span>
              {doc.onChain && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-200 text-violet-900 font-semibold">⛓ ANCHORED</span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 text-white/80">{doc.version}</span>
            </div>
            <div className="font-display text-xl mt-1 truncate">{doc.title}</div>
            <div className="text-[11px] text-white/65 mt-1">
              {doc.type} · {doc.category} · Effective {doc.effective}
              {doc.smartContract && <> · <span className="text-violet-300 font-mono">{doc.smartContract}</span></>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-white/10 text-white shrink-0">✕</button>
        </div>

        {/* parties strip */}
        {doc.parties && doc.parties.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
            <span className="text-[10px] tracking-widest text-slate-500">PARTIES:</span>
            {doc.parties.map((p) => (
              <span key={p} className="text-[11px] px-2 py-1 rounded bg-white border border-slate-200 text-navy-800">{p}</span>
            ))}
          </div>
        )}

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 lg:px-10 py-8 bg-[#fbfbf7]">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <div className="text-[10px] tracking-[0.3em] text-gold-700 font-bold">BEYU HOLDING COMPANY LTD</div>
              <div className="font-display text-2xl text-navy-800 mt-2">{doc.title}</div>
              <div className="text-[11px] text-slate-500 mt-1">Version {doc.version} · Effective {doc.effective}</div>
              <div className="gold-divider w-16 mx-auto mt-3" />
            </div>

            <p className="text-sm italic text-slate-600 mb-6 leading-relaxed">{doc.summary}</p>

            <div className="space-y-5">
              {doc.sections.map((s, i) => (
                <div key={i}>
                  <h3 className="font-display text-lg text-navy-800">{s.heading}</h3>
                  <p className="text-sm text-slate-700 mt-1.5 leading-relaxed whitespace-pre-line">{s.body}</p>
                </div>
              ))}
            </div>

            {/* footer chain proof */}
            <div className="mt-10 pt-6 border-t border-slate-200">
              <div className="rounded-lg bg-slate-100 p-4 text-[11px] text-slate-600 font-mono">
                <div className="flex items-center gap-2 mb-1">
                  <I.shield size={12} stroke="#7c3aed" />
                  <span className="text-violet-700 font-semibold tracking-widest">INTEGRITY PROOF</span>
                </div>
                <div>document_hash: {doc.hash}</div>
                <div>algorithm: keccak256</div>
                {doc.smartContract && <div>contract: {doc.smartContract}</div>}
                <div>anchored: {doc.onChain ? "yes · private Hyperledger Besu + L2 mirror" : "no — eSign only"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* footer actions */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center gap-2">
          <button className="btn-outline text-xs !py-2">Download PDF</button>
          <button className="btn-outline text-xs !py-2">Audit Trail</button>
          {doc.onChain && <button className="btn-outline text-xs !py-2">View on Chain</button>}
          <div className="flex-1" />
          <button className="btn-primary text-xs !py-2">
            {doc.status === "Pending Signature" ? "Sign Document" : "New Revision"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Inline Doc List (reusable) ─────────────────────────── */

export function DocList({ docs, title, subtitle, onOpen }: {
  docs: BeyuDoc[];
  title?: string;
  subtitle?: string;
  onOpen: (d: BeyuDoc) => void;
}) {
  return (
    <div className="card overflow-hidden">
      {(title || subtitle) && (
        <div className="px-5 py-3 border-b border-slate-100">
          {title && <div className="font-display text-lg text-navy-800">{title}</div>}
          {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {docs.map((d) => {
          const Icon = I[DOC_TYPE_ICON[d.type] as keyof typeof I] || I.doc;
          return (
            <button
              key={d.id}
              onClick={() => onOpen(d)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
                <Icon size={16} stroke="#0B1D3A" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-slate-500">{d.id}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                  {d.onChain && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">⛓</span>}
                </div>
                <div className="text-sm font-medium text-navy-800 mt-0.5">{d.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{d.type} · {d.version} · {d.effective}</div>
              </div>
              <I.chevronR size={14} stroke="#94a3b8" className="mt-3" />
            </button>
          );
        })}
        {docs.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No documents linked yet.</div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Global hook helper ─────────────────────────── */

export function useDocOpener(): [BeyuDoc | null, (d: BeyuDoc | null) => void, () => void] {
  const [doc, setDoc] = useState<BeyuDoc | null>(null);
  return [doc, setDoc, () => setDoc(null)];
}

/* ─────────────────────────── Document Hub Screen ─────────────────────────── */

export function LegalLibraryScreen({ filterModule }: { filterModule?: DocModule }) {
  const [doc, setDoc] = useState<BeyuDoc | null>(null);
  const [q, setQ] = useState("");
  const all = filterModule ? BEYU_DOCS.filter((d) => d.modules.includes(filterModule)) : BEYU_DOCS;
  const docs = all.filter((d) =>
    !q || d.title.toLowerCase().includes(q.toLowerCase()) || d.id.toLowerCase().includes(q.toLowerCase()) || d.type.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
            <I.search size={16} stroke="#64748b" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by title, ID, type…"
              className="bg-transparent flex-1 outline-none text-sm"
            />
          </div>
          <div className="text-xs text-slate-500">{docs.length} of {all.length} documents</div>
        </div>
        <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
          {docs.map((d) => {
            const Icon = I[DOC_TYPE_ICON[d.type] as keyof typeof I] || I.doc;
            return (
              <button
                key={d.id}
                onClick={() => setDoc(d)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Icon size={18} stroke="#0B1D3A" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-slate-500">{d.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                    {d.onChain && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">⛓ ANCHORED</span>}
                  </div>
                  <div className="text-sm font-medium text-navy-800 mt-0.5">{d.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{d.type} · {d.version} · effective {d.effective}</div>
                </div>
                <I.chevronR size={14} stroke="#94a3b8" className="mt-3" />
              </button>
            );
          })}
        </div>
      </div>
      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />
    </>
  );
}
