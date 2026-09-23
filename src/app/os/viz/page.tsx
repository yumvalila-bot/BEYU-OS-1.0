/**
 * BEYU OS — HOLOGRAPH workspace (shared capability).
 *
 * The ONE governed frontend of the Holograph capability — the canonical name
 * of the BEYU OS spatial visualization and interaction foundation (code
 * namespace: viz). It serves every canonical consumer — Health OS, Finance
 * OS, Agriculture OS, UJENZI OS (a full Sector OS) and the BEYU Foundation —
 * through the same page; sector selection never changes the security
 * boundary (each adapter re-authorizes).
 *
 * Holograph is a SHARED BEYU OS CAPABILITY, never an OS: it holds no OS
 * registry entry, owns no sector truth, and no path here posts anything
 * (CAP_POSTING remains LOCKED).
 *
 * Page-level authority mirrors the API boundary:
 *   • viz:scene.read (or viz:registry.read for registry-only access);
 *   • entity-scoped principals are refused rather than silently widened
 *     (same fail-closed rule as agriculture/ujenzi/foundation pages);
 *   • initial data is read inside the tenant database context (RLS active)
 *     and classification-filtered by the services themselves;
 *   • the Family Office spatial view additionally requires the organization
 *     read boundary and degrades to a reason, never a partial leak.
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
import { listAssets, assetFormatSupportMatrix } from "@/lib/viz/assets";
import { listDevices } from "@/lib/viz/devices";
import { listRenderProfiles } from "@/lib/viz/render-profiles";
import { listInteractions } from "@/lib/viz/interactions";
import { familyOfficeStructureView } from "@/lib/viz/family-office-view";
import {
  HOLOGRAPH_CANONICAL_DEFINITION,
  HOLOGRAPH_IS,
  HOLOGRAPH_IS_NOT,
  HOLOGRAPH_AUTHORIZATION_ORDER,
  holographSubsystemStatus,
} from "@/lib/viz/holograph";
import { VizWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Holograph — Spatial Visualization & Digital Twins — BEYU OS",
};

export default async function VizPage() {
  const sceneAccess = await requireAccess("viz:scene.read");
  const access = sceneAccess.allowed ? sceneAccess : await requireAccess("viz:registry.read");
  if (!access.allowed) {
    return <Denied reason={access.reason} capability="viz:scene.read" />;
  }
  const principal = access.principal;
  const sceneRead = can(principal, "viz:scene.read").allowed;
  const assetRead = can(principal, "viz:asset.read").allowed;
  const assetManage = can(principal, "viz:asset.manage").allowed;
  const deviceManage = can(principal, "viz:device.manage").allowed;
  const interactionExecute = can(principal, "viz:interaction.execute").allowed;
  if (sceneRead && principal.entityScope.length > 0) {
    return (
      <Denied
        reason="The Holograph capability aggregates sector rows without complete legal-entity keys; entity-scoped access is refused rather than widened to tenant level."
        capability="viz:scene.read"
      />
    );
  }

  return withTenantDatabaseContext(principal, async () => {
    const registry = await registryFor(principal);
    const [scenes, twins] = sceneRead
      ? await Promise.all([listScenes(principal), listTwins(principal)])
      : [[], []];

    // The presentation registries degrade to empty (with the permission flag
    // false in the UI) when the principal lacks the registries-read grant —
    // a missing grant never becomes a partial dataset.
    let assets: Awaited<ReturnType<typeof listAssets>> = [];
    let devices: Awaited<ReturnType<typeof listDevices>> = [];
    let profiles: Awaited<ReturnType<typeof listRenderProfiles>> = [];
    let interactions: Awaited<ReturnType<typeof listInteractions>> = [];
    if (assetRead) {
      [assets, devices, profiles] = await Promise.all([
        listAssets(principal),
        listDevices(principal),
        listRenderProfiles(principal),
      ]);
    }
    if (interactionExecute) {
      [interactions] = await Promise.all([listInteractions(principal, { limit: 50 })]);
    }

    // Family Office spatial view: requires BOTH the Holograph surface and the
    // organization read boundary; the service throws SCOPE otherwise.
    let familyOffice = null;
    let familyOfficeReason: string | null = null;
    if (sceneRead && can(principal, "organization:entity.read").allowed) {
      try {
        familyOffice = await familyOfficeStructureView(principal);
      } catch (err) {
        familyOfficeReason = err instanceof Error ? err.message : "The Family Office spatial view is unavailable for this principal.";
      }
    } else if (sceneRead) {
      familyOfficeReason = "The Family Office spatial view additionally requires the organization read boundary (organization:entity.read).";
    }

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
        holograph={{
          definition: HOLOGRAPH_CANONICAL_DEFINITION,
          is: HOLOGRAPH_IS,
          isNot: HOLOGRAPH_IS_NOT,
          authorizationOrder: HOLOGRAPH_AUTHORIZATION_ORDER,
          subsystems: holographSubsystemStatus(),
        }}
        assets={assets}
        assetFormatSupport={assetFormatSupportMatrix()}
        devices={devices}
        profiles={profiles}
        interactions={interactions}
        familyOffice={familyOffice}
        familyOfficeReason={familyOfficeReason}
        permissions={{
          sceneRead,
          sceneManage: can(principal, "viz:scene.manage").allowed,
          exportAllowed: can(principal, "viz:export").allowed,
          dimensionManage: can(principal, "viz:dimension.manage").allowed,
          assetRead,
          assetManage,
          deviceManage,
          interactionExecute,
        }}
      />
    );
  });
}
