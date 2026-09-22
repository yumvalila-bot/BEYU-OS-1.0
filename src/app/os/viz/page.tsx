/**
 * BEYU OS — Dimensional Graphics & Digital Twins workspace (shared capability).
 *
 * The ONE governed frontend of the Universal Dimensional Graphics,
 * Visualization, Simulation, Digital Twin & Future XR Foundation. It serves
 * every canonical consumer — Health OS, Finance OS, Agriculture OS, UJENZI OS
 * (a full Sector OS) and the BEYU Foundation — through the same page; sector
 * selection never changes the security boundary (each adapter re-authorizes).
 *
 * Page-level authority mirrors the API boundary:
 *   • viz:scene.read (or viz:registry.read for registry-only access);
 *   • entity-scoped principals are refused rather than silently widened
 *     (same fail-closed rule as agriculture/ujenzi/foundation pages);
 *   • initial data is read inside the tenant database context (RLS active)
 *     and classification-filtered by the services themselves.
 */
import { can } from "@/lib/authz";
import { Denied } from "@/components/brand";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
// Concrete modules (not the barrel): the page bundle stays lean and never
// transitively imports the Noelia tool chain.
import { listScenes, listTwins, registryFor, VIZ_SUBSYSTEM_STATUS } from "@/lib/viz/service";
import { adapterDescriptors } from "@/lib/viz/adapters";
import { rendererCapabilityMatrix } from "@/lib/viz/renderers";
import { VizWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dimensional Graphics & Twins — BEYU OS",
};

export default async function VizPage() {
  const sceneAccess = await requireAccess("viz:scene.read");
  const access = sceneAccess.allowed ? sceneAccess : await requireAccess("viz:registry.read");
  if (!access.allowed) {
    return <Denied reason={access.reason} capability="viz:scene.read" />;
  }
  const principal = access.principal;
  const sceneRead = can(principal, "viz:scene.read").allowed;
  if (sceneRead && principal.entityScope.length > 0) {
    return (
      <Denied
        reason="The Universal Dimensional Graphics capability aggregates sector rows without complete legal-entity keys; entity-scoped access is refused rather than widened to tenant level."
        capability="viz:scene.read"
      />
    );
  }

  return withTenantDatabaseContext(principal, async () => {
    const registry = await registryFor(principal);
    const [scenes, twins] = sceneRead
      ? await Promise.all([listScenes(principal), listTwins(principal)])
      : [[], []];
    return (
      <VizWorkspace
        registry={{
          dimensions: registry.dimensions,
          canonicalCount: registry.canonicalCount,
          extensionCount: registry.extensionCount,
        }}
        scenes={scenes}
        twins={twins}
        adapters={adapterDescriptors()}
        renderers={rendererCapabilityMatrix()}
        subsystems={VIZ_SUBSYSTEM_STATUS}
        permissions={{
          sceneRead,
          sceneManage: can(principal, "viz:scene.manage").allowed,
          exportAllowed: can(principal, "viz:export").allowed,
          dimensionManage: can(principal, "viz:dimension.manage").allowed,
        }}
      />
    );
  });
}
