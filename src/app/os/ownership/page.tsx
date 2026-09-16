import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities, ownershipRecords, shareClasses } from "@/db/schema";
import { Badge, Denied, EmptyState, Metric, Panel } from "@/components/brand";
import { can } from "@/lib/authz";
import { classificationsAtOrBelow } from "@/lib/constants";
import { EquityError } from "@/lib/equity/errors";
import { readCapTable } from "@/lib/equity/service";
import { requirePrincipal } from "@/lib/guard";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * Ownership shared capability.
 *
 * Entity-level ownership remains authoritative in organization.ownership_records;
 * instrument-level capitalization remains computed by the existing Equity
 * service. This route creates neither a second registry nor a second cap table.
 * The two sections are queried only under their own grants.
 */
export default async function OwnershipPage() {
  const principal = await requirePrincipal();
  const ownershipDecision = can(principal, "organization:ownership.read");
  const capTableDecision = can(principal, "equity:cap-table.read", {
    classification: "RESTRICTED",
  });
  const canOwnership = ownershipDecision.allowed;
  const canCapTable = capTableDecision.allowed;
  const canReadEntityDirectory = can(principal, "organization:entity.read").allowed;

  if (!canOwnership && !canCapTable) {
    return (
      <Denied
        reason="Neither ownership-registry nor restricted cap-table read access is active for this principal."
        capability="organization:ownership.read OR equity:cap-table.read"
      />
    );
  }

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    // The ownership table has no independent classification label. Resolve
    // visible owned entities as authorization metadata first, then load only
    // relationships whose subject is within that tenant/entity/clearance set.
    const ownershipEntityPredicate =
      principal.entityScope.length > 0
        ? and(
            inArray(legalEntities.tenantId, scope),
            inArray(legalEntities.id, principal.entityScope),
            inArray(legalEntities.classification, allowedClassifications),
          )
        : and(
            inArray(legalEntities.tenantId, scope),
            inArray(legalEntities.classification, allowedClassifications),
          );
    const visibleOwnershipEntityIds = canOwnership
      ? await db
          .select({ id: legalEntities.id })
          .from(legalEntities)
          .where(ownershipEntityPredicate)
          .then((rows) => rows.map((row) => row.id))
      : [];
    const ownershipRows =
      canOwnership && visibleOwnershipEntityIds.length > 0
        ? await db
            .select()
            .from(ownershipRecords)
            .where(
              and(
                inArray(ownershipRecords.tenantId, scope),
                inArray(
                  ownershipRecords.ownedEntityId,
                  visibleOwnershipEntityIds,
                ),
              ),
            )
        : [];

    /*
     * Cap-table discovery comes from the Equity domain's share-class records,
     * not from enumerating the Organisation directory under an equity-only
     * grant. readCapTable repeats the canonical permission, tenant, entity and
     * fixed RESTRICTED-classification checks for every discovered entity.
     * The service intentionally treats another tenant as a separate boundary,
     * so this candidate query remains on the principal's exact tenant too.
     */
    const candidatePredicate =
      principal.entityScope.length > 0
        ? and(
            eq(shareClasses.tenantId, principal.tenantId),
            inArray(shareClasses.legalEntityId, principal.entityScope),
            inArray(
              shareClasses.classification,
              allowedClassifications,
            ),
          )
        : and(
            eq(shareClasses.tenantId, principal.tenantId),
            inArray(
              shareClasses.classification,
              allowedClassifications,
            ),
          );
    const capTableCandidates = canCapTable
      ? await db
          .selectDistinct({ legalEntityId: shareClasses.legalEntityId })
          .from(shareClasses)
          .where(candidatePredicate)
      : [];

    const capTables = await Promise.all(
      capTableCandidates.map(async ({ legalEntityId }) => {
        try {
          return {
            legalEntityId,
            table: await readCapTable(principal, { legalEntityId }),
            unavailable: null,
          };
        } catch (error) {
          if (error instanceof EquityError) {
            return {
              legalEntityId,
              table: null,
              unavailable:
                "The canonical Equity service refused this cap table under the current tenant, entity or classification scope.",
            };
          }
          throw error;
        }
      }),
    );

    const referencedEntityIds = [
      ...new Set([
        ...ownershipRows.map((row) => row.ownedEntityId),
        ...ownershipRows.flatMap((row) =>
          row.ownerEntityId ? [row.ownerEntityId] : [],
        ),
        ...capTableCandidates.map((row) => row.legalEntityId),
      ]),
    ];
    const entityLabelPredicate =
      principal.entityScope.length > 0
        ? and(
            inArray(legalEntities.tenantId, scope),
            inArray(legalEntities.id, referencedEntityIds),
            inArray(legalEntities.id, principal.entityScope),
            inArray(legalEntities.classification, allowedClassifications),
          )
        : and(
            inArray(legalEntities.tenantId, scope),
            inArray(legalEntities.id, referencedEntityIds),
            inArray(legalEntities.classification, allowedClassifications),
          );
    const entities =
      canReadEntityDirectory && referencedEntityIds.length > 0
        ? await db
            .select({ id: legalEntities.id, legalName: legalEntities.legalName })
            .from(legalEntities)
            .where(entityLabelPredicate)
        : [];
    const entityName = new Map(
      entities.map((entity) => [entity.id, entity.legalName]),
    );
    const entityLabel = (entityId: string) =>
      entityName.get(entityId) ?? `Legal entity ${entityId}`;

    const economicTotal = ownershipRows.reduce(
      (sum, row) => sum + Number(row.economicPct),
      0,
    );
    const readableCapTables = capTables.filter((entry) => entry.table).length;
    const beneficial = ownershipRows.filter(
      (row) => row.ownershipType === "BENEFICIAL",
    ).length;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">
            Shared capability · ownership
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">
            Organisation ownership and capitalization
          </h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Legal and beneficial ownership is read from the canonical
            Organisation registry. Instrument-level holdings are computed by the
            governed Equity engine; Finance OS remains authoritative for every
            financial consequence.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Ownership records"
            value={canOwnership ? String(ownershipRows.length) : "Restricted"}
            sub={
              canOwnership
                ? "within tenant and entity scope"
                : "organization:ownership.read not granted"
            }
          />
          <Metric
            label="Beneficial records"
            value={canOwnership ? String(beneficial) : "Restricted"}
            sub="explicit registry classification"
          />
          <Metric
            label="Economic percentages"
            value={canOwnership ? `${economicTotal.toFixed(2)}%` : "Restricted"}
            sub="sum of visible records; not a valuation"
          />
          <Metric
            label="Readable cap tables"
            value={canCapTable ? String(readableCapTables) : "Restricted"}
            sub={
              canCapTable
                ? `${capTables.length} share-class-backed candidate${capTables.length === 1 ? "" : "s"}`
                : "equity:cap-table.read not granted or clearance insufficient"
            }
          />
        </div>

        <Panel
          kicker="Organisation source of truth"
          title="Legal, beneficial and control interests"
        >
          {canOwnership ? (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Owned entity</th>
                    <th>Owner</th>
                    <th>Type</th>
                    <th>Instrument</th>
                    <th>Economic</th>
                    <th>Voting</th>
                    <th>Control rights</th>
                    <th>Effective</th>
                    <th>Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {ownershipRows.map((record) => (
                    <tr key={record.id}>
                      <td className="font-medium">
                        {entityLabel(record.ownedEntityId)}
                      </td>
                      <td>
                        {record.ownerEntityId
                          ? entityLabel(record.ownerEntityId)
                          : record.ownerPartyId
                            ? `Party ${record.ownerPartyId}`
                            : "Not recorded"}
                      </td>
                      <td>
                        <Badge
                          tone={
                            record.ownershipType === "BENEFICIAL"
                              ? "gold"
                              : "navy"
                          }
                        >
                          {record.ownershipType}
                        </Badge>
                      </td>
                      <td className="text-[11.5px]">{record.instrument}</td>
                      <td className="tabular-nums">
                        {Number(record.economicPct).toFixed(2)}%
                      </td>
                      <td className="tabular-nums">
                        {Number(record.votingPct).toFixed(2)}%
                      </td>
                      <td className="max-w-xs text-[11.5px] beyu-muted">
                        {record.controlRights ?? "None recorded"}
                      </td>
                      <td className="text-[11.5px] beyu-muted">
                        {record.effectiveFrom} → {record.effectiveTo ?? "open"}
                      </td>
                      <td className="max-w-xs text-[11.5px] beyu-muted">
                        {record.provenance}
                      </td>
                    </tr>
                  ))}
                  {ownershipRows.length === 0 && (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState message="No ownership records exist in your governed entity scope." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="Ownership records were not queried because organization:ownership.read is not granted." />
          )}
        </Panel>

        <Panel
          kicker="Equity source of truth"
          title="Live capitalization by legal entity"
        >
          {canCapTable ? (
            <div className="space-y-5">
              {capTables.map(({ legalEntityId, table, unavailable }) => (
                <section
                  key={legalEntityId}
                  className="rounded-xl border border-[color:var(--beyu-line)] p-4"
                  aria-labelledby={`cap-table-${legalEntityId}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3
                        id={`cap-table-${legalEntityId}`}
                        className="text-[14px] font-semibold"
                      >
                        {entityLabel(legalEntityId)}
                      </h3>
                      <p className="mt-1 text-[10.5px] beyu-muted">
                        {table
                          ? `Computed ${new Date(table.computedAt).toISOString()}`
                          : unavailable}
                      </p>
                    </div>
                    <Badge tone={table ? "green" : "amber"}>
                      {table ? "LIVE COMPUTATION" : "UNAVAILABLE IN SCOPE"}
                    </Badge>
                  </div>
                  {table ? (
                    <>
                      <dl className="mt-4 grid gap-2 text-[11.5px] sm:grid-cols-2 xl:grid-cols-5">
                        {[
                          ["Authorized", table.authorizedShares],
                          ["Issued", table.issuedShares],
                          ["Outstanding", table.outstandingShares],
                          ["Fully diluted", table.fullyDilutedShares],
                          ["Treasury", table.treasuryShares],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="rounded-lg bg-[color:var(--beyu-line)]/35 px-3 py-2"
                          >
                            <dt className="beyu-kicker beyu-muted">{label}</dt>
                            <dd className="mt-0.5 font-mono font-semibold tabular-nums">
                              {Number(value).toLocaleString("en-US")}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-4 overflow-x-auto">
                        <table className="beyu-table">
                          <thead>
                            <tr>
                              <th>Holder</th>
                              <th>Holder type</th>
                              <th>Class</th>
                              <th>Total shares</th>
                              <th>Vested</th>
                              <th>Unvested</th>
                              <th>Economic %</th>
                              <th>Voting %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {table.breakdown.holders.map((entry) => (
                              <tr key={`${entry.holderName}:${entry.holderType}:${entry.shareClassCode}`}>
                                <td className="font-medium">{entry.holderName}</td>
                                <td>
                                  <Badge tone="slate">{entry.holderType}</Badge>
                                </td>
                                <td className="font-mono text-[10.5px]">
                                  {entry.shareClassCode}
                                </td>
                                <td className="tabular-nums">
                                  {entry.totalShares.toLocaleString("en-US")}
                                </td>
                                <td className="tabular-nums">
                                  {entry.vestedShares.toLocaleString("en-US")}
                                </td>
                                <td className="tabular-nums">
                                  {entry.unvestedShares.toLocaleString("en-US")}
                                </td>
                                <td className="tabular-nums">
                                  {entry.economicPct === null ? "—" : `${entry.economicPct}%`}
                                </td>
                                <td className="tabular-nums">
                                  {entry.votingPct === null ? "—" : `${entry.votingPct}%`}
                                </td>
                              </tr>
                            ))}
                            {table.breakdown.holders.length === 0 && (
                              <tr>
                                <td colSpan={8}>
                                  <EmptyState message="The share class exists, but no instrument-level positions are currently computed for this entity." />
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="mt-4">
                      <EmptyState message={unavailable ?? "Cap table unavailable."} />
                    </div>
                  )}
                </section>
              ))}
              {capTables.length === 0 && (
                <EmptyState message="No share-class-backed cap tables exist in your governed tenant and entity scope." />
              )}
            </div>
          ) : (
            <EmptyState message="Capitalization was not queried because equity:cap-table.read is not granted at RESTRICTED clearance." />
          )}
          <p className="mt-4 text-[11px] beyu-muted">
            This is a read-only deterministic view. It never posts to Finance,
            moves money, alters ownership history or turns a dilution scenario
            into an actual transaction.
          </p>
        </Panel>
      </div>
    );
  });
}
