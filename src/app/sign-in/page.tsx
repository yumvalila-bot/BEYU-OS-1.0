/** The single shared, host-aware authentication and authorized landing implementation. */
import CanonicalSignInPage from "../canonical-sign-in";

// Route segment configuration must be declared by the route module itself: the
// canonical host, the session and the destination authorization are all
// per-request facts, so this route is never prerendered or cached.
export const dynamic = "force-dynamic";

export default CanonicalSignInPage;
