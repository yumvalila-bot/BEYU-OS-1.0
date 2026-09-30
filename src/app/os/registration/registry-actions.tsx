"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * BEYU REGISTRY — governed registration actions (presentation only).
 *
 * Holds NO authority: every action POSTs to the capability-guarded
 * /api/v1/admin/registry/* API. The SERVER re-authorizes (RBAC + ABAC +
 * tenant/entity/country scope + MFA where high-risk), validates, refuses
 * duplicates as controlled conflicts, and appends the hash-chained audit
 * record + enterprise event atomically. This component only renders what the
 * server authorizes and re-reads the truth after each act — no optimistic
 * local state, no browser-storage persistence, no client-side authorization.
 */

const input =
  "w-full rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-[#d4af37]";
const label = "block text-[11px] font-medium tracking-wide beyu-muted mb-1";
const button =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#d4af37]/60 bg-[#d4af37]/15 px-3 text-[12px] font-semibold text-[#8a6d10] transition hover:bg-[#d4af37]/25 disabled:opacity-50 dark:text-[#efd98f]";
const sectionTitle = "beyu-kicker text-[#b08d1c]";

type ApiError = { code?: string; message?: string; details?: unknown };

async function post(url: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: ApiError; data?: unknown };
  if (!res.ok) {
    const code = json?.error?.code ? ` [${json.error.code}]` : "";
    return { ok: false, message: `${json?.error?.message ?? `The governed registration was refused (${res.status}).`}${code}` };
  }
  return { ok: true, message: "Registered through the BEYU Registry — audited, evented, in scope." };
}

function useForm(url: string, initial: Record<string, string>, build: (f: Record<string, string>) => unknown, success: (f: Record<string, string>) => string) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState(initial);
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await post(url, build(form));
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(success(form));
    setForm(initial);
    startTransition(() => router.refresh());
  }
  return { form, set, busy, error, done, submit };
}

function Banner({ error, done }: { error: string | null; done: string | null }) {
  if (error)
    return (
      <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-700 dark:text-red-300">
        {error}
      </p>
    );
  if (done)
    return (
      <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-[11.5px] text-emerald-700 dark:text-emerald-300">
        {done}
      </p>
    );
  return null;
}

/* ------------------------------------------------------------------ */
/* Person party — person ≠ user: never creates a login identity        */
/* ------------------------------------------------------------------ */

export function RegisterPersonForm({ defaultTenantId }: { defaultTenantId: string }) {
  const initial = {
    displayName: "",
    email: "",
    countryCode: "",
    primaryTenantId: defaultTenantId,
    reason: "",
  };
  const { form, set, busy, error, done, submit } = useForm(
    "/api/v1/admin/registry/parties",
    initial,
    (f) => ({
      displayName: f.displayName,
      email: f.email || null,
      countryCode: f.countryCode || null,
      primaryTenantId: f.primaryTenantId,
      reason: f.reason,
    }),
    (f) => `Person party registered for “${f.displayName}” — NO user, password or role was created.`,
  );
  return (
    <div className="space-y-3">
      <p className={sectionTitle}>Register a person (canonical Party)</p>
      <p className="text-[11.5px] beyu-muted">
        Creates a canonical identity master record only. A duplicate email or matching name + birth
        date is refused as a controlled conflict — identities are never silently merged.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Display name</span>
          <input className={input} value={form.displayName} onChange={(e) => set("displayName")(e.target.value)} placeholder="Full name" />
        </div>
        <div>
          <span className={label}>Email (conflict key)</span>
          <input className={input} value={form.email} onChange={(e) => set("email")(e.target.value.toLowerCase())} placeholder="name@example.com" />
        </div>
        <div>
          <span className={label}>Country</span>
          <input className={input} value={form.countryCode} onChange={(e) => set("countryCode")(e.target.value.toUpperCase().slice(0, 2))} placeholder="TZ" maxLength={2} />
        </div>
        <div>
          <span className={label}>Reason (governed, ≥10 chars)</span>
          <input className={input} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this registration is legitimate" />
        </div>
      </div>
      <Banner error={error} done={done} />
      <button type="button" className={button} disabled={busy || !form.displayName || !form.reason} onClick={submit}>
        {busy ? "Registering…" : "Register person party"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Family — governed domain entity (never an OS / tenant)              */
/* ------------------------------------------------------------------ */

export function RegisterFamilyForm({ tenants }: { tenants: Array<{ id: string; code: string; name: string }> }) {
  const initial = {
    tenantId: tenants[0]?.id ?? "",
    code: "",
    displayName: "",
    countryCode: "",
    reason: "",
  };
  const { form, set, busy, error, done, submit } = useForm(
    "/api/v1/admin/registry/families",
    initial,
    (f) => ({
      tenantId: f.tenantId,
      code: f.code,
      displayName: f.displayName,
      countryCode: f.countryCode || null,
      reason: f.reason,
    }),
    (f) => `Family ${f.code.toUpperCase()} registered with its canonical ORGANIZATION party identity.`,
  );
  if (tenants.length === 0) return <p className="text-[12px] beyu-muted">No tenant in your scope.</p>;
  return (
    <div className="space-y-3">
      <p className={sectionTitle}>Register a family</p>
      <p className="text-[11.5px] beyu-muted">
        One governed transaction creates the family&apos;s MDM identity (parties · ORGANIZATION) and
        the families domain row. Duplicate codes are refused — never silently merged.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Tenant</span>
          <select className={input} value={form.tenantId} onChange={(e) => set("tenantId")(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Family code (unique in tenant)</span>
          <input className={input} value={form.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} placeholder="KILIMANJARO" />
        </div>
        <div>
          <span className={label}>Display name</span>
          <input className={input} value={form.displayName} onChange={(e) => set("displayName")(e.target.value)} placeholder="Family display name" />
        </div>
        <div>
          <span className={label}>Country</span>
          <input className={input} value={form.countryCode} onChange={(e) => set("countryCode")(e.target.value.toUpperCase().slice(0, 2))} placeholder="TZ" maxLength={2} />
        </div>
        <div>
          <span className={label}>Reason (governed, ≥10 chars)</span>
          <input className={input} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this registration is legitimate" />
        </div>
      </div>
      <Banner error={error} done={done} />
      <button type="button" className={button} disabled={busy || !form.code || !form.displayName || !form.reason} onClick={submit}>
        {busy ? "Registering…" : "Register family"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Legal entity — TENANT ≠ LEGAL ENTITY ≠ BUSINESS                     */
/* ------------------------------------------------------------------ */

const ENTITY_TYPES = [
  "HOLDING",
  "COUNTRY_HOLDING",
  "OPERATING_COMPANY",
  "SUBSIDIARY",
  "TRUST",
  "FOUNDATION",
  "PARTNERSHIP",
  "JOINT_VENTURE",
  "ASSOCIATE",
  "BRANCH",
  "NON_PROFIT",
] as const;

export function RegisterEntityForm({ tenants }: { tenants: Array<{ id: string; code: string; name: string }> }) {
  const initial = {
    tenantId: tenants[0]?.id ?? "",
    code: "",
    legalName: "",
    entityType: "OPERATING_COMPANY" as string,
    countryCode: "",
    registrationNumber: "",
    reason: "",
  };
  const { form, set, busy, error, done, submit } = useForm(
    "/api/v1/admin/registry/entities",
    initial,
    (f) => ({
      tenantId: f.tenantId,
      code: f.code,
      legalName: f.legalName,
      entityType: f.entityType,
      countryCode: f.countryCode,
      registrationNumber: f.registrationNumber || null,
      reason: f.reason,
    }),
    (f) => `Legal entity ${f.code.toUpperCase()} registered (${f.entityType}).`,
  );
  if (tenants.length === 0) return <p className="text-[12px] beyu-muted">No tenant in your scope.</p>;
  return (
    <div className="space-y-3">
      <p className={sectionTitle}>Register a legal entity</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Tenant</span>
          <select className={input} value={form.tenantId} onChange={(e) => set("tenantId")(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Entity code (global unique)</span>
          <input className={input} value={form.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} placeholder="BEYU-HOLDINGS" />
        </div>
        <div>
          <span className={label}>Legal name</span>
          <input className={input} value={form.legalName} onChange={(e) => set("legalName")(e.target.value)} placeholder="Registered legal name" />
        </div>
        <div>
          <span className={label}>Entity type</span>
          <select className={input} value={form.entityType} onChange={(e) => set("entityType")(e.target.value)}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Country</span>
          <input className={input} value={form.countryCode} onChange={(e) => set("countryCode")(e.target.value.toUpperCase().slice(0, 2))} placeholder="TZ" maxLength={2} />
        </div>
        <div>
          <span className={label}>Registration number</span>
          <input className={input} value={form.registrationNumber} onChange={(e) => set("registrationNumber")(e.target.value)} placeholder="Optional — unique per tenant" />
        </div>
        <div>
          <span className={label}>Reason (governed, ≥10 chars)</span>
          <input className={input} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this registration is legitimate" />
        </div>
      </div>
      <Banner error={error} done={done} />
      <button type="button" className={button} disabled={busy || !form.code || !form.legalName || !form.countryCode || !form.reason} onClick={submit}>
        {busy ? "Registering…" : "Register legal entity"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Business / operating unit — org unit, not a tenant, not an entity   */
/* ------------------------------------------------------------------ */

const UNIT_TYPES = ["DIVISION", "DEPARTMENT", "BRANCH", "TEAM"] as const;

export function RegisterBusinessForm({
  tenants,
  entities,
}: {
  tenants: Array<{ id: string; code: string; name: string }>;
  entities: Array<{ id: string; code: string; legalName: string; tenantId: string }>;
}) {
  const initial = {
    tenantId: tenants[0]?.id ?? "",
    legalEntityId: "",
    code: "",
    name: "",
    unitType: "DIVISION" as string,
    reason: "",
  };
  const { form, set, busy, error, done, submit } = useForm(
    "/api/v1/admin/registry/businesses",
    initial,
    (f) => ({
      tenantId: f.tenantId,
      legalEntityId: f.legalEntityId,
      code: f.code,
      name: f.name,
      unitType: f.unitType,
      reason: f.reason,
    }),
    (f) => `Business unit ${f.code.toUpperCase()} registered under the selected legal entity.`,
  );
  const scopedEntities = entities.filter((e) => e.tenantId === form.tenantId);
  if (tenants.length === 0) return <p className="text-[12px] beyu-muted">No tenant in your scope.</p>;
  return (
    <div className="space-y-3">
      <p className={sectionTitle}>Register a business / operating unit</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Tenant</span>
          <select className={input} value={form.tenantId} onChange={(e) => set("tenantId")(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Legal entity</span>
          <select className={input} value={form.legalEntityId} onChange={(e) => set("legalEntityId")(e.target.value)}>
            <option value="">Select an in-scope entity…</option>
            {scopedEntities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} — {e.legalName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Unit code (unique)</span>
          <input className={input} value={form.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} placeholder="BEYU-OPS-DAR" />
        </div>
        <div>
          <span className={label}>Unit name</span>
          <input className={input} value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Dar es Salaam Operations" />
        </div>
        <div>
          <span className={label}>Unit type</span>
          <select className={input} value={form.unitType} onChange={(e) => set("unitType")(e.target.value)}>
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Reason (governed, ≥10 chars)</span>
          <input className={input} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this registration is legitimate" />
        </div>
      </div>
      <Banner error={error} done={done} />
      <button
        type="button"
        className={button}
        disabled={busy || !form.code || !form.name || !form.legalEntityId || !form.reason}
        onClick={submit}
      >
        {busy ? "Registering…" : "Register business unit"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ownership — effective-dated; never silently overwritten             */
/* ------------------------------------------------------------------ */

const OWNERSHIP_TYPES = ["DIRECT", "INDIRECT", "BENEFICIAL", "CONTROL_ONLY"] as const;

export function RegisterOwnershipForm({
  tenants,
  entities,
  persons,
}: {
  tenants: Array<{ id: string; code: string; name: string }>;
  entities: Array<{ id: string; code: string; legalName: string; tenantId: string }>;
  persons: Array<{ id: string; displayName: string }>;
}) {
  const initial = {
    tenantId: tenants[0]?.id ?? "",
    ownedEntityId: "",
    ownerPartyId: "",
    ownershipType: "DIRECT" as string,
    economicPct: "",
    votingPct: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    provenance: "",
    reason: "",
  };
  const { form, set, busy, error, done, submit } = useForm(
    "/api/v1/admin/registry/ownership",
    initial,
    (f) => ({
      tenantId: f.tenantId,
      ownedEntityId: f.ownedEntityId,
      ownerPartyId: f.ownerPartyId,
      ownershipType: f.ownershipType,
      economicPct: Number(f.economicPct),
      votingPct: Number(f.votingPct || f.economicPct),
      effectiveFrom: f.effectiveFrom,
      provenance: f.provenance,
      reason: f.reason,
    }),
    () => "Ownership recorded — effective-dated, audited; overlapping periods are refused.",
  );
  const scopedEntities = entities.filter((e) => e.tenantId === form.tenantId);
  if (tenants.length === 0) return <p className="text-[12px] beyu-muted">No tenant in your scope.</p>;
  return (
    <div className="space-y-3">
      <p className={sectionTitle}>Record an ownership right</p>
      <p className="text-[11.5px] beyu-muted">
        OWNERSHIP ≠ MEMBERSHIP ≠ ROLE ≠ PERMISSION. High-risk act: the server requires an MFA
        step-up and refuses overlapping periods instead of overwriting history.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Tenant</span>
          <select className={input} value={form.tenantId} onChange={(e) => set("tenantId")(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Owned entity</span>
          <select className={input} value={form.ownedEntityId} onChange={(e) => set("ownedEntityId")(e.target.value)}>
            <option value="">Select an entity…</option>
            {scopedEntities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} — {e.legalName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Owner (person party)</span>
          <select className={input} value={form.ownerPartyId} onChange={(e) => set("ownerPartyId")(e.target.value)}>
            <option value="">Select a person…</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Ownership type</span>
          <select className={input} value={form.ownershipType} onChange={(e) => set("ownershipType")(e.target.value)}>
            {OWNERSHIP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Economic %</span>
          <input className={input} value={form.economicPct} onChange={(e) => set("economicPct")(e.target.value)} placeholder="62" />
        </div>
        <div>
          <span className={label}>Voting %</span>
          <input className={input} value={form.votingPct} onChange={(e) => set("votingPct")(e.target.value)} placeholder="Defaults to economic %" />
        </div>
        <div>
          <span className={label}>Effective from</span>
          <input className={input} type="date" value={form.effectiveFrom} onChange={(e) => set("effectiveFrom")(e.target.value)} />
        </div>
        <div>
          <span className={label}>Provenance (evidence, ≥5 chars)</span>
          <input className={input} value={form.provenance} onChange={(e) => set("provenance")(e.target.value)} placeholder="Share certificate / resolution ref" />
        </div>
        <div>
          <span className={label}>Reason (governed, ≥10 chars)</span>
          <input className={input} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this record is legitimate" />
        </div>
      </div>
      <Banner error={error} done={done} />
      <button
        type="button"
        className={button}
        disabled={busy || !form.ownedEntityId || !form.ownerPartyId || !form.economicPct || !form.provenance || !form.reason}
        onClick={submit}
      >
        {busy ? "Recording…" : "Record ownership"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Employment — employment ≠ membership ≠ role; creates no privilege   */
/* ------------------------------------------------------------------ */

export function RegisterEmploymentForm({
  tenants,
  entities,
  persons,
}: {
  tenants: Array<{ id: string; code: string; name: string }>;
  entities: Array<{ id: string; code: string; legalName: string; tenantId: string }>;
  persons: Array<{ id: string; displayName: string }>;
}) {
  const initial = {
    tenantId: tenants[0]?.id ?? "",
    partyId: "",
    legalEntityId: "",
    employeeNo: "",
    hireDate: new Date().toISOString().slice(0, 10),
    countryCode: "",
    employmentType: "PERMANENT" as string,
    reason: "",
  };
  const { form, set, busy, error, done, submit } = useForm(
    "/api/v1/admin/registry/employment",
    initial,
    (f) => ({
      tenantId: f.tenantId,
      partyId: f.partyId,
      legalEntityId: f.legalEntityId,
      employeeNo: f.employeeNo,
      hireDate: f.hireDate,
      countryCode: f.countryCode,
      employmentType: f.employmentType,
      reason: f.reason,
    }),
    (f) => `Employment ${f.employeeNo} registered with its canonical HIRE event — no role, no privilege.`,
  );
  const scopedEntities = entities.filter((e) => e.tenantId === form.tenantId);
  if (tenants.length === 0) return <p className="text-[12px] beyu-muted">No tenant in your scope.</p>;
  return (
    <div className="space-y-3">
      <p className={sectionTitle}>Register an employment relationship</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Tenant</span>
          <select className={input} value={form.tenantId} onChange={(e) => set("tenantId")(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Person (canonical party)</span>
          <select className={input} value={form.partyId} onChange={(e) => set("partyId")(e.target.value)}>
            <option value="">Select a person…</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Employing legal entity</span>
          <select className={input} value={form.legalEntityId} onChange={(e) => set("legalEntityId")(e.target.value)}>
            <option value="">Select an entity…</option>
            {scopedEntities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} — {e.legalName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Employee number (unique)</span>
          <input className={input} value={form.employeeNo} onChange={(e) => set("employeeNo")(e.target.value.toUpperCase())} placeholder="BEYU-EMP-00042" />
        </div>
        <div>
          <span className={label}>Hire date</span>
          <input className={input} type="date" value={form.hireDate} onChange={(e) => set("hireDate")(e.target.value)} />
        </div>
        <div>
          <span className={label}>Country of work</span>
          <input className={input} value={form.countryCode} onChange={(e) => set("countryCode")(e.target.value.toUpperCase().slice(0, 2))} placeholder="TZ" maxLength={2} />
        </div>
        <div>
          <span className={label}>Employment type</span>
          <select className={input} value={form.employmentType} onChange={(e) => set("employmentType")(e.target.value)}>
            {["PERMANENT", "FIXED_TERM", "PROBATION", "CONSULTANT", "INTERN"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Reason (governed, ≥10 chars)</span>
          <input className={input} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this registration is legitimate" />
        </div>
      </div>
      <Banner error={error} done={done} />
      <button
        type="button"
        className={button}
        disabled={busy || !form.partyId || !form.legalEntityId || !form.employeeNo || !form.countryCode || !form.reason}
        onClick={submit}
      >
        {busy ? "Registering…" : "Register employment"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Family member — relationship only; member ≠ user                    */
/* ------------------------------------------------------------------ */

const RELATIONSHIPS = [
  "BIRTH_DESCENDANT",
  "ADOPTED_CHILD",
  "STEPCHILD",
  "SPOUSE_OF_MEMBER",
  "FORMER_SPOUSE_OF_MEMBER",
  "OTHER_AFFINAL",
  "NON_FAMILY",
] as const;

export function RegisterFamilyMemberForm({
  familyId,
  persons,
  members,
}: {
  familyId: string;
  persons: Array<{ id: string; displayName: string }>;
  members: Array<{ id: string; displayName: string; relationshipToParent: string }>;
}) {
  const initial = {
    partyId: "",
    relationshipType: "BIRTH_DESCENDANT" as string,
    parentMemberId: "",
    linkedToMemberId: "",
    branch: "",
    provenance: "",
    reason: "",
  };
  const { form, set, busy, error, done, submit } = useForm(
    `/api/v1/admin/registry/families/${familyId}/members`,
    initial,
    (f) => ({
      partyId: f.partyId,
      relationshipType: f.relationshipType,
      parentMemberId: f.parentMemberId || null,
      linkedToMemberId: f.linkedToMemberId || null,
      branch: f.branch || null,
      provenance: f.provenance,
      reason: f.reason,
    }),
    () => "Family membership registered — a relationship row only; NO user, role or permission was created.",
  );
  return (
    <div className="space-y-3">
      <p className={sectionTitle}>Add a family member (relationship)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Person (canonical party)</span>
          <select className={input} value={form.partyId} onChange={(e) => set("partyId")(e.target.value)}>
            <option value="">Select a person…</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Relationship</span>
          <select className={input} value={form.relationshipType} onChange={(e) => set("relationshipType")(e.target.value)}>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Parent member (descent)</span>
          <select className={input} value={form.parentMemberId} onChange={(e) => set("parentMemberId")(e.target.value)}>
            <option value="">— none (founder) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({m.relationshipToParent})
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Linked member (affinal)</span>
          <select className={input} value={form.linkedToMemberId} onChange={(e) => set("linkedToMemberId")(e.target.value)}>
            <option value="">— not applicable —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Branch (founder only)</span>
          <input className={input} value={form.branch} onChange={(e) => set("branch")(e.target.value)} placeholder="FOUNDER" />
        </div>
        <div>
          <span className={label}>Provenance (≥5 chars)</span>
          <input className={input} value={form.provenance} onChange={(e) => set("provenance")(e.target.value)} placeholder="Birth certificate / council record" />
        </div>
        <div>
          <span className={label}>Reason (governed, ≥10 chars)</span>
          <input className={input} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this membership is legitimate" />
        </div>
      </div>
      <Banner error={error} done={done} />
      <button
        type="button"
        className={button}
        disabled={busy || !form.partyId || !form.provenance || !form.reason}
        onClick={submit}
      >
        {busy ? "Adding…" : "Add membership"}
      </button>
    </div>
  );
}
