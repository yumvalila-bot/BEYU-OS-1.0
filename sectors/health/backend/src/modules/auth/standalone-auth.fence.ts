/**
 * Standalone Health authentication fence (audit finding C-2; decision D-3).
 *
 * BEYU OS is the sole identity authority. The Health sector must not mint,
 * accept or refresh credentials of its own: no public registration, no
 * password login, and no token refresh or restore from a standalone session.
 *
 * The fence is enforced in the handlers in auth.controller.ts. It is not left to
 * the global guard, because register and login are reachable without a token by
 * design (@Public), so the handler is the only enforcement point that matters.
 *
 * The only way to lift the fence is BEYU_HEALTH_STANDALONE_AUTH_TEST_ONLY=true in
 * a non-production process. That flag exists for the Jest and PGlite suites,
 * which exercise the full guard chain. It is refused by validateBootEnvironment
 * and validateProductionBoot, and this policy also refuses it structurally when
 * NODE_ENV is production, whatever the flag says.
 *
 * Lifting the fence in a deployed environment is not a configuration option.
 * The governed identity bridge (decision D-3) must be implemented and verified
 * first, and that is outside this module.
 */
import { ForbiddenException } from "@nestjs/common";

export const STANDALONE_AUTH_TEST_ONLY_ENV =
  "BEYU_HEALTH_STANDALONE_AUTH_TEST_ONLY";

export type StandaloneAuthOperation =
  "register" | "login" | "refresh" | "restore";

export function standaloneAuthPermitted(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  // Strict match. "1", "TRUE" and "yes" do not lift the fence.
  return env[STANDALONE_AUTH_TEST_ONLY_ENV] === "true";
}

export function assertStandaloneAuthPermitted(
  operation: StandaloneAuthOperation,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (standaloneAuthPermitted(env)) return;
  throw new ForbiddenException({
    code: "STANDALONE_AUTH_DISABLED",
    message:
      "Health OS does not issue or accept standalone credentials. Sign in through BEYU OS.",
    operation,
  });
}
