/**
 * Jest global setup: defaults for every spec.
 *
 * BEYU_IDENTITY_TEST_HARNESS=true makes registration auto-link synthetic
 * canonical references through the REAL bridge machinery, so specs exercise
 * the full canonical-link invariant (register → link → login → act) without
 * a live BEYU control plane. Production refuses this flag at boot validation
 * and structurally in IdentityFederationService.mode().
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.BEYU_IDENTITY_TEST_HARNESS =
  process.env.BEYU_IDENTITY_TEST_HARNESS ?? "true";
