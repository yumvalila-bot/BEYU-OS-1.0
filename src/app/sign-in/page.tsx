/**
 * `/sign-in` — the canonical sign-in route on EVERY canonical host.
 *
 *   https://beyu.co.tz/sign-in              → BEYU OS control-plane sign-in
 *   https://health.beyu.co.tz/sign-in       → Health OS sign-in
 *   https://finance.beyu.co.tz/sign-in      → Finance OS sign-in
 *   https://agriculture.beyu.co.tz/sign-in  → Agriculture OS sign-in
 *   https://ujenzi.beyu.co.tz/sign-in       → Ujenzi OS sign-in
 *   https://foundation.beyu.co.tz/sign-in   → Foundation sign-in
 *   https://familyoffice.beyu.co.tz/sign-in → Family Office sign-in
 *   https://noelia.beyu.co.tz/sign-in       → Noelia sign-in
 *
 * WHY THIS FILE DELEGATES INSTEAD OF RE-IMPLEMENTING
 *   The requirement is ONE shared sign-in foundation with destination-specific
 *   presentation — explicitly NOT eight independent authentication
 *   implementations. `src/app/page.tsx` IS that foundation: it resolves the
 *   canonical destination from the `Host` header server-side through the one
 *   contract (`src/lib/canonical-hosts.ts`), renders `GovernedSignIn` for a
 *   destination host, the control-plane sign-in for the apex/`www`/any NEUTRAL
 *   host, and the governed `DestinationDenied` state for a signed-in identity
 *   that does not hold access.
 *
 *   This route passes the `sign-in` presentation variant — a compile-time
 *   argument, never a request-derived switch. The two canonical URLs therefore
 *   cannot drift: hostname→destination resolution, shared authentication,
 *   post-auth landing, the denial state and the session-expired state are the
 *   same implementation.
 *
 * SECURITY — unchanged, and unchanged by having a second URL
 *   • The route resolves nothing of its own: no credential, no session, no
 *     authorization decision lives here.
 *   • The hostname selects PRESENTATION only. Authorization is server-side and
 *     re-evaluated by the destination route on arrival.
 *   • The post-auth landing is a server-computed same-origin path derived from
 *     the canonical contract — never from a query string — so this route cannot
 *     be turned into an open redirector.
 *   • A hostile, unknown or unconfigured host resolves to NEUTRAL and receives
 *     the control-plane surface with every existing gate in force; it can never
 *     select a destination frontend.
 */
import { CanonicalSignInPage } from "../page";

// Route segment configuration must be declared by the route module itself: the
// canonical host, the session and the destination authorization are all
// per-request facts, so this route is never prerendered or cached.
export const dynamic = "force-dynamic";

export default CanonicalSignInPage;
