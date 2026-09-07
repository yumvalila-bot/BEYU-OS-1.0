# Payment Provider Research — Tanzania rails (BEYU OS 2.0 payments programme)

**Date:** 2026-09-06. **Method:** public web sources reachable from this sandbox. No provider
was contacted, no partner portal was authenticated into, no credential exists, and nothing in
this file has been confirmed by a provider.

**Code fact this document must never contradict:** `src/lib/payments/providers/` contains
exactly one adapter, `mock.ts`. `payment_providers` in the development database contains
exactly one row, `MOCK_SANDBOX` (`integration_status = SANDBOX_VERIFIED`). Everything below is
research about rails BEYU is **not** integrated with. `REAL_PROVIDER_E2E = BLOCKED_NOT_ATTEMPTED`.

## 1. Where the provider assessment actually lives (corrected by measurement)

An earlier phase of this programme recorded its provider assessment as rows in
`payment_providers`. Those rows are gone: a fixture sweep removed them, and a restore would do the
same. Reading that as "the assessment was lost" would have been wrong, and re-measuring it is what
produced this section.

**The assessment is version-controlled in code**, not in the table:
`src/lib/payments/providers/index.ts` holds `REGISTERED_PROVIDER_CODES` — nine entries,
`MOCK_SANDBOX`, `MPESA_TZ`, `AIRTEL_MONEY_TZ`, `HALOPESA_TZ`, `TIGO_PESA_TZ`, `MIXX_YAS_TZ`,
`TTCL_PESA_TZ`, `NMB_BANK_TZ`, `CRDB_BANK_TZ` — each built by `notIntegrated(...)` with
`integrationStatus = NOT_INTEGRATED`, `contractStatus = NOT_INVESTIGATED`,
`credentialStatus = NOT_ISSUED`, `apiAvailability`/`webhookModel`/`settlementModel` = `UNVERIFIED`,
`regulatoryEnforcement = NOT_INVESTIGATED`, `sandboxMode = NONE`, an empty
`supportedCapabilities` list, and `lastAssessedAt = 2026-09-06`. The file's own header states the
two things it refuses: enabling a provider because an adapter exists, and collapsing ten facts into
one boolean. That is why the self-test can report "9 providers assessed; live claims: 0" while
`payment_providers` holds **one** row (measured 2026-09-06: `MOCK_SANDBOX` only, connections,
accounts, mappings, policies, transactions, inbox and PAY-sourced journal entries all at 0): the
ledger is the honest starting point the table "must not exceed", and the table is authoritative at
runtime.

So the durable-record concern is **not** "the assessment has no home". It is the two accuracy
defects below, both created by research catching up with code:

> **F-NEW-1a (P2, registry accuracy — OPEN, not remediated here).** `TIGO_PESA_TZ` and
> `MIXX_YAS_TZ` are listed as **two separate rails** in `REGISTERED_PROVIDER_CODES`, while the
> research in §2 establishes that Tigo Pesa *is* Mixx by Yas (MIC Tanzania rebranded to Yas in
> November 2024 and the wallet followed). Counting one operator's franchise as two inflates
> coverage and will distort volume and reconciliation reporting. Owner: payments lead. Decide:
> keep one code with an alias, or keep both with an explicit "same operator, rebranded"
> relationship — do not silently delete a code that historical rows may reference.
>
> **F-NEW-1b (P3, documentation drift — OPEN).** `NOT_INVESTIGATED_EVIDENCE` in the same file
> asserts, for every rail: *"No provider documentation was retrieved and no request was made to any
> provider endpoint."* That sentence was true when written and is **no longer** literally true:
> this phase retrieved public developer documentation (see the confidence labels in §2), while
> still having made no request to any provider endpoint and holding no credential. `UNVERIFIED`
> remains the correct status — a third-party guide is not verification with the operator — but the
 *prose must be updated to point at this file, or a reader will conclude nothing was read.*
> Owner: payments lead. Not changed here, because editing the ledger's prose while the statuses
> stay put is a documentation act that belongs with whoever ratifies the ledger.

Two further notes for whoever writes the first real adapter: the ledger covers **no aggregator**
(Selcom-class rails are in §2 but not in the registry), and **MTN MoMo is deliberately absent** —
its current Tanzanian operator status was not established (§2), and a code would be a claim.

## 2. The rails, and what is actually known about each

Confidence vocabulary: **PRIMARY** (an official operator/regulator source located),
**SECONDARY** (developer guides or third-party documentation, plausible but unconfirmed by the
operator), **NOT_ESTABLISHED** (searched, nothing reliable found).

| Rail | Public API surface | Confidence | Auth / confirmation pattern as reported | Credential | Integration |
|---|---|---|---|---|---|
| **Vodacom M-Pesa Tanzania (Vodash)** | A Vodacom M-Pesa developer portal at `openapiportal.m-pesa.com` is described as serving Tanzania among other markets, with a self-service test-app registration | SECONDARY | Merchant code (`serviceProviderCode`) issued by Vodacom after business registration; per-call `ThirdPartyConversationID` and `TransactionReference` both required to be unique; operations reported as C2B, B2C, B2B, reversal, transaction-status | `NOT_ISSUED` | `NOT_INTEGRATED` |
| **Airtel Money Tanzania** | Airtel Africa developer portal `developers.airtel.africa`, with separate sandbox (`openapiuat`) and production (`openapi`) hosts reported | SECONDARY | OAuth2 client-credentials → bearer token; production access gated by KYB/compliance approval; collections + disbursements; customer authorises on the handset | `NOT_ISSUED` | `NOT_INTEGRATED` |
| **Tigo Pesa → "Mixx by Yas"** | No operator developer portal located in this session | **NOT_ESTABLISHED** | The rebranding is the important fact: MIC Tanzania became **Yas** (Nov 2024) and Tigo Pesa now trades as **Mixx by Yas** (PRIMARY, operator/Wikipedia-sourced). Any integration named `TIGO_PESA` targets a brand that no longer exists | `NOT_ISSUED` | `NOT_INTEGRATED` — **and the rail's name must be corrected before anyone writes an adapter** |
| **HaloPesa (Halotel)** | Operator site confirms HaloPesa is "a licensed Mobile Money service in Tanzania"; no developer portal located | PARTIAL (licensing claim PRIMARY from the operator's own site; no API evidence) | none observed | `NOT_ISSUED` | `NOT_INTEGRATED` |
| **MTN MoMo Tanzania** | Searched for the current Tanzanian operator status, including whether the business moved to Halo; **not determined** | **NOT_ESTABLISHED** | — | `NOT_ISSUED` | **DO NOT MODEL.** A `MTN_MOMO` row with TZ country code would be an unverified claim about market presence |
| **Miza, EzyPesa, TTCL Pesa, other wallets** | Named only through an aggregator's utility-code table (see §3) | SECONDARY, aggregator-sourced | — | `NOT_ISSUED` | `NOT_INTEGRATED` |
| **Selcom (aggregator, not a wallet)** | Public developer documentation at `developers.selcommobile.com` covering wallet cash-in for M-Pesa, Airtel Money, Mixx by Yas, EzyPesa, HaloPesa, TTCL Pesa, an "auto-route by MNP lookup" cash-in, a checkout API, and ~40 named Tanzanian banks for the bank rail | **PRIMARY-equivalent** (the operator's own documentation domain, read in this session) | Checkout API with **webhook notification to the merchant** — documented as firing **only on successful transactions** | `NOT_ISSUED` | `NOT_INTEGRATED` |

No provider's documented surface above has been matched against a signed contract, a partner
portal agreement, or a test credential. Documentation of an API is not access to one.

## 3. What the research changes about the design (the only part worth engineering time)

| # | Finding as reported | Why it matters to this codebase, concretely |
|---|---|---|
| 1 | **Successful-only callbacks** at the aggregator: "Webhook only on successful transactions" | Absence of a callback is **not** evidence of non-payment. Therefore (a) the pending/`UNDETERMINED` path in `payment_transactions` and the `TRANSACTION_QUERY` capability flag are mandatory, not defensive; (b) completeness must come from a **settlement artifact**, which is exactly what `ingestSettlementBatch` + `settlement RECONCILED ⇒ unmatched_count = 0 AND item_count = matched_count` already enforce; (c) any "no callback received → mark failed" logic would be a false statement to the ledger and must never be written |
| 2 | Provider APIs carry their **own unique reference fields** (a conversation id and a transaction reference, both required unique) | This is why `unique(connection_id, provider_transaction_id)` and `unique(connection_id, idempotency_key)` are the right shape and why they are scoped **per connection**: a provider's uniqueness guarantee is not global, and two credentials on one provider can legitimately produce the same reference. A retry with the *same* id but *different bytes* is treated as `DUPLICATE_CONFLICT` + a CRITICAL exception rather than as a duplicate, which is the behaviour the aggregator's own reference discipline implies |
| 3 | Confirmation happens **on the handset** (USSD push / PIN), asynchronously | A payment initiation returns "prompt sent", not "paid". So the trust ladder `RECEIVED → VERIFIED_PROVIDER → RECONCILED_BANK / CONFIRMED_MANUAL → POSTED` is the honest model, and `POSTED` requires `VERIFIED` + `RECONCILED` — the code already refuses to post on the strength of a request |
| 4 | OAuth2 client-credentials at one rail, merchant-code + per-call references at another | Secrets must stay **environment indirections**, not values: the schema's `credential_ref` / `signing_secret_ref` hold *names of environment variables* by design, and `payment_providers` has no column able to hold a secret — a fact worth repeating at review time, because "just add an API key column" will be proposed |
| 5 | **Reversal is a separate instruction** (a reversal endpoint / merchant-approved email path), and a confirmed customer payment is not self-reversible | Our accounting already matches: `accounting_status` may move `POSTED → REVERSED` only, and only through `payment_corrections` with a requester, a decider and an approval reference. A provider "reversal" notification therefore cannot silently change a posted journal entry; it must raise a correction |
| 6 | A **business relationship precedes credentials** (KYB/compliance approval, merchant code issued after registration; reported lead time of weeks) | This is the true critical path, not adapter code. `credentialStatus = NOT_ISSUED` is the state of every real rail, and the registry's `blockedOn[0] = BLOCKED_EXTERNAL_DEPENDENCY` is a statement about a sales process, not about engineering backlog |
| 7 | Aggregation is available (one API over several rails) | It collapses integration work but **adds a regulated dependency**: under BoT Licensing Regs 2015 r.6(o) outsourcing arrangements are a documented application input, and the aggregator's own completeness rules (finding 1) then apply to every rail behind it. A second, worse problem: through an aggregator, BEYU's counterparty data is the aggregator's view of a wallet, so name/lookup asymmetry (documented as "LookUp Available: No" for one rail) becomes a reason the existing rule "never auto-match a payment to a customer from a name" must stay |
| 8 | Interoperability is a **customer** feature, not an API feature (TZ wallets have been interoperable since 2014) | Money arriving *from* another wallet does not make it a different rail: `provider_code` describes who told us about the money, so the `payment_accounts`/mapping model keyed per provider+connection remains correct, and a single "interoperable" bucket would destroy settlement traceability |
| 9 | Payment-transaction records are **personal data**, and one operator publicly describes itself as a registered data controller with Tanzania's PDPC | Reinforces the residency and minimisation findings in `PAYMENT_REGULATORY_RESEARCH_BOT_TANZANIA.md` (§2, Licensing Regs r.41/r.42 and the PDPA row): any real integration extends the personal-data footprint from a `counterparty_name` column to full provider payloads, which is a design decision to take before the first credential arrives, not after |

## 4. Deliberately absent from this document

- **No support claim.** Nothing here says BEYU "supports" M-Pesa, Airtel, Mixx, Halo or Selcom.
  The only executable provider logic is `providers/mock.ts`, and it says so in its own
  `blocked_reason`.
- **No invented contract terms.** Fee schedules, settlement timing (T+1 or otherwise),
  reversal windows, rate limits, mandate language and liability caps are **NOT_ESTABLISHED**
  in this session; the `settlement_model` column for every real rail must therefore stay
  `UNVERIFIED`, and an adapter may not default it.
- **No effort estimate.** A per-provider build cost cannot be stated honestly while items 5–7
  above are unverified; a number written here would be read as a plan.
- **No claim that any statement above is confirmed by an operator.** The two `SECONDARY`-rated
  rows rest on third-party developer guides. Before an adapter is written, each fact must be
  re-read from the operator's own partner documentation, and this table is the checklist for
  doing that.

## 5. What the schema already does about over-claiming (verified, not asserted)

Read from the development database on 2026-09-06, `payment_providers` carries these CHECK
constraints, which is why the honesty rules are structural rather than advisory:

- `payment_providers_status_needs_evidence` — any status beyond `NOT_INTEGRATED`, `ADAPTER_CODED`
  or `BLOCKED_EXTERNAL_DEPENDENCY` requires `sandbox_evidence` to be non-null.
- `payment_providers_prod_needs_approval` — `PRODUCTION_CONFIGURED`/`PRODUCTION_VERIFIED` require
  both `enabled_by` and `approval_reference`.
- Enum CHECKs on `integration_status`, `contract_status`, `credential_status`, `api_availability`,
  `webhook_model`, `settlement_model`, `signature_scheme` — an invented status string cannot be
  stored.

**Accepted limitation, recorded rather than hidden:** `sandbox_evidence` and `productionEvidence`
are free text. `upsertProvider` demands at least ten characters for a production claim, which
stops an empty string and nothing else: a determined writer can move a row to
`PRODUCTION_VERIFIED` with a fabricated sentence and a matching approval reference. If a
production claim must be *impossible* without external proof, the evidence field has to become a
reference to an approvals record (validated by FK), not prose. Proposed, not built — it changes
the governance model, not a bug. Owner: Platform governance + CFO.
