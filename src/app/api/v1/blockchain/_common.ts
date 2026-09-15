/**
 * Shared helpers for the `/api/v1/blockchain/*` routes.
 *
 * Same discipline as the contracting routes: no authorization, idempotency or
 * audit logic is re-implemented here, and the vocabularies come from the pure
 * layer so a request schema cannot drift from what the engines accept.
 *
 * The one addition is a guard against the failure mode this domain is most
 * exposed to — a client asserting that a network is (or is not) production, or
 * that a contract is registered. `production` and registry verification are read
 * from the server-side catalogue and registry rows, never from the body, so the
 * execution-gate route below cannot be talked into a weaker posture.
 */

import {
  ADDRESS20,
  CLASSIFICATIONS,
  ISO_DATE,
  CONTRACT_API_VERSION,
  HASH32,
  NETWORK_KEYS,
  contractApiError,
  todayIso,
} from "../contracts/_common";

export const BLOCKCHAIN_API_VERSION = CONTRACT_API_VERSION;
export { ADDRESS20, CLASSIFICATIONS, HASH32, ISO_DATE, NETWORK_KEYS, contractApiError, todayIso };
