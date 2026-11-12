import { Badge, Panel } from "@/components/brand";
import { TAX_INTELLIGENCE_CAPABILITIES } from "@/lib/finance/tax-intelligence-capabilities";

/**
 * FINANCE_OS capability register. This is a truthful readiness view, not an
 * activation control. Activation is performed only through governed specialist
 * approval after legal-source authentication.
 */
export function TaxIntelligenceCapabilities() {
  return (
    <Panel kicker="FINANCE_OS · governed tax intelligence" title="Six integrated tax-intelligence capabilities">
      <div className="space-y-3">
        <p className="text-[11px] beyu-muted">
          The platform is being built in dependency order. Legal source authentication and the
          effective-dated knowledge base come first. No tax computation, customs duty, filing
          deadline, return submission or legal conclusion is activated by this capability register.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TAX_INTELLIGENCE_CAPABILITIES.map((capability, index) => (
            <article key={capability.code} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-mono beyu-muted">0{index + 1}</span>
                <Badge tone="amber">INACTIVE · GATED</Badge>
              </div>
              <h3 className="mt-2 text-[12px] font-semibold">{capability.title}</h3>
              <p className="mt-1 text-[10.5px] beyu-muted">{capability.description}</p>
              <div className="mt-3 border-t border-[color:var(--beyu-line)] pt-2">
                <div className="text-[9px] font-semibold uppercase tracking-wide beyu-muted">Activation condition</div>
                <div className="mt-1 text-[10px]">{capability.activation.replaceAll("_", " ")}</div>
              </div>
            </article>
          ))}
        </div>
        <div className="rounded-lg border border-[color:var(--beyu-line)] p-3">
          <div className="text-[11px] font-semibold">Non-negotiable control gates</div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[10.5px] beyu-muted">
            <li>Original official source, SHA-256 checksum, page-level text validation and named specialist review.</li>
            <li>Effective-date and jurisdiction matching, with amendments, repeal and supersession relationships preserved.</li>
            <li>Capability-specific approval by an authorized specialist, with an approval reference and review period.</li>
            <li>NOELIA citations restricted to authenticated sources; model-generated text is never legal authority.</li>
            <li>No automated tax posting, return filing, customs declaration, payment or clearance.</li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}
