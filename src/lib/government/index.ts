/**
 * Government Integration Fabric — public surface.
 *
 * ONE gateway, ONE adapter contract, an EXTENSIBLE portfolio. Consumers
 * (Health, Finance, Agriculture, HCM, Noelia tools, API routes) import from
 * here and only from here; reaching an adapter class directly from sector
 * code is an architecture violation (tests/government/architecture-boundary
 * enforces it).
 */
export * from "./adapter";
export { GovernmentGateway, GovernmentGatewayError, type GovernmentActor } from "./gateway";

import { GovernmentGateway } from "./gateway";
import { TraVfdAdapter } from "./adapters/tra-vfd";
import { NhifAdapter } from "./adapters/nhif";
import { NidaAdapter } from "./adapters/nida";
import { Dhis2Adapter } from "./adapters/dhis2";
import { createContractPendingAdapters } from "./adapters/contract-pending";
import { MockGovernmentAdapter } from "./adapters/mock";

export { TraVfdAdapter, TRA_VFD_CREDENTIAL_REFS, traSubmitSchema } from "./adapters/tra-vfd";
export { NhifAdapter, NHIF_CREDENTIAL_REFS, nhifClaimFolioSchema } from "./adapters/nhif";
export { NidaAdapter, NIDA_CREDENTIAL_REFS } from "./adapters/nida";
export { Dhis2Adapter, DHIS2_CREDENTIAL_REFS, dhis2AggregateSchema } from "./adapters/dhis2";
export { ContractPendingAdapter, createContractPendingAdapters } from "./adapters/contract-pending";
export { MockGovernmentAdapter, MOCK_AGENCY_CODE, mockGovSubmitSchema } from "./adapters/mock";

/**
 * Canonical default gateway construction. The full initial portfolio (§16.5)
 * is mounted; each adapter reports its own honest status.
 */
export function createDefaultGovernmentGateway(): GovernmentGateway {
  const gateway = new GovernmentGateway();
  gateway.register(new TraVfdAdapter());
  gateway.register(new NhifAdapter());
  gateway.register(new NidaAdapter());
  gateway.register(new Dhis2Adapter());
  for (const adapter of createContractPendingAdapters()) gateway.register(adapter);
  gateway.register(new MockGovernmentAdapter());
  return gateway;
}
