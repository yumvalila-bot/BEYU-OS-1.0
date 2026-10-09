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
// Standalone Health credentials are fenced (C-2 / D-3). The existing auth suites
// drive register/login through the real handlers, so the test-only flag lifts the
// fence here. Production refuses the flag at boot and in the policy itself.
process.env.BEYU_HEALTH_STANDALONE_AUTH_TEST_ONLY =
  process.env.BEYU_HEALTH_STANDALONE_AUTH_TEST_ONLY ?? "true";
