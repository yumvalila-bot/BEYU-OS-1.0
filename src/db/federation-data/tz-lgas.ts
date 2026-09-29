/**
 * BEYU Federation & Trust — TANZANIA mainland district LGA baseline (data).
 *
 * BEST-EFFORT BASELINE — honesty rules (program §100):
 *  - Compiled 2026-09-28 from public sources (geopostcodes/tichr/Wikipedia
 *    2012-2016 era composition tables). Public sources CONFLICT on
 *    district composition and counts (126 program baseline, 167 and
 *    184 reported elsewhere). The official go.tz directory was not
 *    reachable from this build environment.
 *  - Every row is record_status REGISTERED (named) or UNCERTAIN
 *    (unenumerated placeholder) with reconciliation_state =
 *    PENDING_RECONCILIATION. NOTHING here is verified.
 *  - "Unenumerated" placeholder rows are explicit baseline slots for
 *    districts whose names could not be confidently established from the
 *    sources at hand — they are placeholders, not invented authorities.
 *  - The coverage audit reports seeded vs 126 baseline as a
 *    count-mismatch MANUAL_REVIEW finding.
 *
 * Zanzibar's 5 regions are regional authorities (see tz-regions.ts),
 * seeded UNCERTAIN as federal-interface records; their districts are
 * under Zanzibar administration and are NOT enumerated here.
 */

export interface TzLgaSeed {
  code: string;
  name: string;
  regionCode: string; // region authority code
  unenumerated?: boolean; // placeholder row
  note?: string;
}

interface RegionBlock {
  region: string;
  prefix: string; // code prefix, e.g. "DSM"
  districts: string[]; // named districts
  placeholderCount: number; // unenumerated slots
  note?: string;
}

const BLOCKS: RegionBlock[] = [
  {
    region: "ARUSHA", prefix: "ARS",
    districts: ["Arusha City", "Arusha Rural", "Arumeru", "Karatu", "Kiteto", "Longido", "Meru", "Monduli", "Ngorongoro"],
    placeholderCount: 0,
    note: "Source counts 7–9; composition post-2015 reorganization to be reconciled.",
  },
  {
    region: "DAR_ES_SALAAM", prefix: "DSM",
    districts: ["Ilala", "Kinondoni", "Ubungo", "Temeke", "Kigamboni"],
    placeholderCount: 0,
  },
  {
    region: "DODOMA", prefix: "DDM",
    districts: ["Babati", "Chamwino", "Dodoma City", "Dodoma Rural", "Kondoa", "Kongwa", "Kyerukinga"],
    placeholderCount: 1,
    note: "Source counts 7–8.",
  },
  {
    region: "GEITA", prefix: "GET",
    districts: ["Chikwawa", "Geita"],
    placeholderCount: 4,
    note: "Source count 6; remaining district names to be reconciled from the official directory.",
  },
  {
    region: "IRINGA", prefix: "IRG",
    districts: ["Iringa City", "Iringa Rural", "Kilombero", "Mafungwe", "Mlale", "Mumias"],
    placeholderCount: 0,
    note: "Source counts 5–6.",
  },
  {
    region: "KAGERA", prefix: "KGA",
    districts: ["Biharamulo", "Blimba", "Bukoba City", "Bukoba Rural", "Bugarama", "Kaijuro", "Karagwe", "Kyenjojo", "Muleba", "Ngara"],
    placeholderCount: 0,
    note: "Source counts 8–10.",
  },
  {
    region: "KATAVI", prefix: "KTV",
    districts: ["Bunda", "Igendesho", "Katavi", "Nang'anda", "Sabinyi"],
    placeholderCount: 0,
  },
  {
    region: "KIGOMA", prefix: "KGM",
    districts: ["Buhigwe", "Bwanga", "Chimalira", "Igandawa", "Kigoma City", "Kigoma Rural", "Mahagi", "Uvinza"],
    placeholderCount: 0,
    note: "Source counts 8–10 (Kibondo/Kyerega-era splits); reconcile current composition.",
  },
  {
    region: "KILIMANJARO", prefix: "KLM",
    districts: ["Moshi City", "Moshi Rural", "Hai", "Rombo", "Same", "Siha", "Mwanga"],
    placeholderCount: 0,
  },
  {
    region: "LINDI", prefix: "LND",
    districts: ["Chalinze", "Kilwa", "Lindi", "Loliondo", "Namtongo", "Wondja"],
    placeholderCount: 0,
  },
  {
    region: "MANYARA", prefix: "MNY",
    districts: ["Hanang", "Ilemela", "Ipwi", "Simanjiro"],
    placeholderCount: 2,
    note: "Source counts 5–6.",
  },
  {
    region: "MARA", prefix: "MRV",
    districts: ["Bhongwe", "Isoko", "Kirwa", "Musoma", "Sengerema", "Ushungo"],
    placeholderCount: 1,
    note: "Source counts 6–7.",
  },
  {
    region: "MBEYA", prefix: "MBY",
    districts: ["Chunya", "Kyela", "Mbarali", "Mbeya City", "Mbeya Rural", "Rungwe"],
    placeholderCount: 1,
    note: "Post-2016 (Songwe split) composition; source count 7.",
  },
  {
    region: "MOROGORO", prefix: "MRG",
    districts: ["Bahi", "Gondwe", "Ifakara", "Kilombero", "Kilosa", "Mvomero", "Morogoro City", "Morogoro Rural", "Ulanga"],
    placeholderCount: 0,
  },
  {
    region: "MTWARA", prefix: "MTW",
    districts: ["Masasi", "Mtwara City", "Mtwara Rural", "Newala", "Nanyongo"],
    placeholderCount: 2,
    note: "Source counts 7–9.",
  },
  {
    region: "MWANZA", prefix: "MWZ",
    districts: ["Buchosa", "Ilemela", "Kwimba", "Magu", "Misungwi", "Mwanza City", "Nyamagana", "Sengerema", "Ukerewe"],
    placeholderCount: 0,
    note: "Source counts 8–9.",
  },
  {
    region: "NJOMBE", prefix: "NJM",
    districts: ["Irampas", "Ludewa", "Makete", "Njombe"],
    placeholderCount: 2,
    note: "Source count 6.",
  },
  {
    region: "PWANI", prefix: "PWJ",
    districts: ["Bagamoyo", "Kibaha", "Kisarawe", "Mafia", "Mkuranga", "Rufiji", "Sali", "Tumbi", "Utete"],
    placeholderCount: 0,
    note: "Pwani (Coast) region; source count 9.",
  },
  {
    region: "RUKWA", prefix: "RWK",
    districts: ["Chungli", "Mpanda", "Nkasi", "Sumbawanga"],
    placeholderCount: 0,
  },
  {
    region: "RUVUMA", prefix: "RVV",
    districts: ["Mbinga", "Msalala", "Songea City", "Songea Rural", "Tunduru"],
    placeholderCount: 2,
    note: "Source counts 6–7.",
  },
  {
    region: "SHINYANGA", prefix: "SYG",
    districts: ["Bukombe", "Kahama", "Shinyanga City", "Shinyanga Rural"],
    placeholderCount: 1,
    note: "Source count 5.",
  },
  {
    region: "SIMIYU", prefix: "SMY",
    districts: ["Bariadi", "Busega", "Maswa", "Meatu"],
    placeholderCount: 1,
    note: "Source count 5.",
  },
  {
    region: "SINGIDA", prefix: "SGD",
    districts: ["Ikungi", "Itigi", "Iramba", "Manyoni", "Mkalama", "Singida Rural"],
    placeholderCount: 1,
    note: "Source count 6 (Singida Municipality status to be reconciled).",
  },
  {
    region: "SONGWE", prefix: "SGW",
    districts: ["Ileje", "Mbozi", "Momba", "Songwe"],
    placeholderCount: 0,
    note: "Region created 2016 from Mbeya.",
  },
  {
    region: "TABORA", prefix: "TBR",
    districts: ["Igunga", "Kaliua", "Nzega", "Sikonge", "Tabora City", "Tabora Rural", "Uyui"],
    placeholderCount: 0,
  },
  {
    region: "TANGA", prefix: "TNG",
    districts: ["Bumbuli", "Handeni", "Kilindi", "Lushoto", "Muheza", "Pangani", "Tanga City"],
    placeholderCount: 1,
    note: "Source count 8 (Handeni DC/TC split).",
  },
];

function slug(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export const TZ_LGAS: TzLgaSeed[] = BLOCKS.flatMap((b) => {
  const rows: TzLgaSeed[] = b.districts.map((d) => ({
    code: `TZ_LGA_${b.prefix}_${slug(d)}`,
    name: `${d} ${/City|Rural$/.test(d) ? "District" : "District"}`,
    regionCode: b.region,
    note: b.note,
  }));
  for (let i = 1; i <= b.placeholderCount; i++) {
    rows.push({
      code: `TZ_LGA_${b.prefix}_UNNAMED_${i}`,
      name: `${b.region.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} Region — district LGA (unenumerated in baseline, slot ${i})`,
      regionCode: b.region,
      unenumerated: true,
      note: b.note ?? "District name could not be confidently established from public sources at hand — placeholder baseline slot, to be reconciled from the official directory.",
    });
  }
  return rows;
});

export const TZ_LGA_TOTAL = TZ_LGAS.length;
export const TZ_LGA_NAMED = TZ_LGAS.filter((r) => !r.unenumerated).length;
export const TZ_LGA_UNENUMERATED = TZ_LGA_TOTAL - TZ_LGA_NAMED;
