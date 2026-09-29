/**
 * BEYU Federation & Trust — TANZANIA region authorities (data).
 *
 * 31 regional administration authorities: 26 mainland regions registered
 * against the federation registry, plus the 5 Zanzibar regions registered
 * as UNCERTAIN FEDERAL-INTERFACE authorities — Zanzibar has its own
 * government and regional administration under the union structure; the
 * mainland registry records the interfaces only and never claims
 * jurisdiction over Zanzibar administration (failure policy).
 *
 * All records: record_status REGISTERED (mainland) / UNCERTAIN (Zanzibar),
 * verification REGISTERED, no connectivity, no claims. Reconciliation
 * against the official regional administration directory is PENDING.
 */

export interface TzRegionSeed {
  code: string;
  name: string;
  short?: string;
  zanzibar?: boolean;
}

const mainland: [string, string, string][] = [
  ["ARUSHA", "Arusha", "Arusha Region"],
  ["DAR_ES_SALAAM", "Dar es Salaam", "Dar es Salaam Region"],
  ["DODOMA", "Dodoma", "Dodoma Region"],
  ["GEITA", "Geita", "Geita Region"],
  ["IRINGA", "Iringa", "Iringa Region"],
  ["KAGERA", "Kagera", "Kagera Region"],
  ["KATAVI", "Katavi", "Katavi Region"],
  ["KIGOMA", "Kigoma", "Kigoma Region"],
  ["KILIMANJARO", "Kilimanjaro", "Kilimanjaro Region"],
  ["LINDI", "Lindi", "Lindi Region"],
  ["MANYARA", "Manyara", "Manyara Region"],
  ["MARA", "Mara", "Mara Region"],
  ["MBEYA", "Mbeya", "Mbeya Region"],
  ["MOROGORO", "Morogoro", "Morogoro Region"],
  ["MTWARA", "Mtwara", "Mtwara Region"],
  ["MWANZA", "Mwanza", "Mwanza Region"],
  ["NJOMBE", "Njombe", "Njombe Region"],
  ["PWANI", "Pwani", "Pwani Region"],
  ["RUKWA", "Rukwa", "Rukwa Region"],
  ["RUVUMA", "Ruvuma", "Ruvuma Region"],
  ["SHINYANGA", "Shinyanga", "Shinyanga Region"],
  ["SINGIDA", "Singida", "Singida Region"],
  ["TABORA", "Tabora", "Tabora Region"],
  ["TANGA", "Tanga", "Tanga Region"],
  ["SONGWE", "Songwe", "Songwe Region"],
  ["SIMIYU", "Simiyu", "Simiyu Region"],
];

const zanzibar: [string, string, string][] = [
  ["UNGUJA_NORTH", "Unguja North", "Unguja North Region"],
  ["UNGUJA_SOUTH", "Unguja South", "Unguja South Region"],
  ["MJINI_MAGHARIBI", "Mjini Magharibi", "Mjini Magharibi Region"],
  ["PEMBA_NORTH", "Pemba North", "Pemba North Region"],
  ["PEMBA_SOUTH", "Pemba South", "Pemba South Region"],
];

export const TZ_REGIONS: TzRegionSeed[] = [
  ...mainland.map(([code, short, name]) => ({ code, name, short })),
  ...zanzibar.map(([code, short, name]) => ({ code, name, short, zanzibar: true })),
];
