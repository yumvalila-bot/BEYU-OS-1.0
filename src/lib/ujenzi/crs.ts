/** Known CRS catalogue. Unknown codes fail closed — never silent mix. */
export const UJENZI_CRS_CATALOGUE = [
  { code: "EPSG:4326", name: "WGS 84", kind: "GEOGRAPHIC", defaultFor: "GPS" },
  { code: "EPSG:21037", name: "Arc 1960 / UTM zone 37S", kind: "PROJECTED", defaultFor: "TZ_MAINLAND_UTM37S" },
  { code: "EPSG:32737", name: "WGS 84 / UTM zone 37S", kind: "PROJECTED", defaultFor: "UTM37S_WGS84" },
  { code: "EPSG:21036", name: "Arc 1960 / UTM zone 36S", kind: "PROJECTED", defaultFor: "TZ_WEST_UTM36S" },
] as const;

export type UjenziCrsCode = (typeof UJENZI_CRS_CATALOGUE)[number]["code"];

export function isKnownCrs(code: string): boolean {
  return UJENZI_CRS_CATALOGUE.some((c) => c.code === code);
}

export function assertCrs(code: string) {
  if (!isKnownCrs(code)) {
    throw new Error(`UNKNOWN_CRS:${code}`);
  }
}

export function validateLonLat(lon: number, lat: number) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  if (lon < -180 || lon > 180) return false;
  if (lat < -90 || lat > 90) return false;
  return true;
}
