/**
 * Governed tenant domains — the ONE public surface of the capability.
 *
 *   hostname.ts          pure normalisation + tenant slug derivation
 *   dns-verification.ts  real DNS TXT ownership proof (hashed challenge)
 *   registry.ts          canonical reads (RLS-scoped; runtime is SELECT-only)
 *   lifecycle-service.ts governed writes (admin boundary, audited, transactional)
 *   resolver.ts          request hostname → NARROWER tenant context, or refusal
 */
export * from "./hostname";
export * from "./dns-verification";
export * from "./registry";
export * from "./resolver";
export * from "./lifecycle-service";
