/**
 * Session PRESENCE — one small server-side fact for the sign-in surfaces.
 *
 * `resolvePrincipal()` (`src/lib/session.ts`) answers "who is this?" and returns
 * null both when no session cookie was sent AND when a cookie was sent but the
 * database no longer honours it (expired, revoked, user inactive). The two cases
 * need different copy on a sign-in surface: the first is a visitor arriving for
 * the first time, the second is a returning user whose session lapsed.
 *
 * This module supplies ONLY the presence fact, so a page can combine
 * `cookiePresent && principal === null` into the truthful "your session has
 * expired" state. It resolves nothing, validates nothing, grants nothing and
 * never reads the cookie VALUE — validity stays exclusively with the database
 * through `resolvePrincipal()`.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./constants";

/** True when the request carried a session cookie, whatever its validity. */
export async function sessionCookiePresent(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(SESSION_COOKIE)?.value);
}
