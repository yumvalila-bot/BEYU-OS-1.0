import { useState } from "react";
import { I } from "./Icons";

type Msg = { role: "user" | "ai"; text: string; meta?: string };

const SEED: Msg[] = [
  {
    role: "ai",
    text: "Good morning, Doctor. I'm BEYU AI Co-Pilot, governed by the Hive Runtime. I have read-only access to patient context for BEYU-100486 (Fatuma Ally, ICU). How can I help?",
    meta: "Hive Policy: clinical-assist · audit-id A8F2C1 · human-override enabled",
  },
];

const SUGGESTIONS = [
  "Summarize last 5 vitals trends",
  "Suggest sepsis bundle compliance check",
  "Draft discharge summary for BEYU-100485",
  "Cross-check ceftriaxone interactions",
];

export function AICoPilot({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");

  const send = (t?: string) => {
    const text = (t ?? input).trim();
    if (!text) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next);
    setInput("");
    setTimeout(() => {
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          text:
            text.toLowerCase().includes("sepsis")
              ? "Sepsis Bundle (1-hour) compliance for BEYU-100486:\n• Lactate measured ✓ (4.2 mmol/L — repeat in 2h)\n• Blood cultures drawn before antibiotics ✓\n• Broad-spectrum antibiotics within 60 min ✓ (Piperacillin-Tazobactam)\n• 30 mL/kg crystalloid for hypotension — IN PROGRESS\n• Vasopressors for MAP ≥65 — Norepinephrine 0.08 mcg/kg/min ✓\n\nRecommendation: re-evaluate lactate clearance at 2h, consider source control imaging."
              : "Drafting response based on EMR context. All suggestions are advisory; final clinical decision rests with the attending physician. Action will be logged to immutable audit trail.",
          meta: "Source: EMR · Confidence 0.86 · Reviewed by safety policy",
        },
      ]);
    }, 500);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-navy-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full flex flex-col slidein shadow-2xl">
        <div className="px-5 py-4 bg-navy-800 text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
            <I.brain size={20} stroke="#0B1D3A" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">BEYU AI Co-Pilot</div>
            <div className="text-[11px] text-white/70 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-soft" />
              Hive Mode · Clinical Assist · Governance Active
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-white/10">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-navy-800 text-white rounded-br-sm" : "bg-white border border-slate-200 rounded-bl-sm"}`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.meta && <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">{m.meta}</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-slate-200 bg-white">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="text-[11px] px-2 py-1 rounded-full bg-slate-100 hover:bg-navy-50 text-navy-700">
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask the Co-Pilot… (governance applied)"
              className="flex-1 px-3 py-2.5 rounded-lg bg-slate-100 outline-none text-sm"
            />
            <button onClick={() => send()} className="btn-primary !py-2.5">Send</button>
          </div>
          <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-2">
            <I.shield size={12} stroke="#64748b" /> All interactions logged · Emergency shutdown available to administrators
          </div>
        </div>
      </div>
    </div>
  );
}
