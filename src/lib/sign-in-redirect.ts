import { canonicalHostForRequest } from "./canonical-host";
import { canonicalHostOptionsFromEnvironment } from "./canonical-hosts";
import { canonicalSignInForHost } from "./public-entry";

/** Canonical redirect for an unauthenticated request; host is never authority. */
export async function signInHrefForRequest(): Promise<string> {
  return canonicalSignInForHost(await canonicalHostForRequest(), canonicalHostOptionsFromEnvironment().canonicalDomain);
}
