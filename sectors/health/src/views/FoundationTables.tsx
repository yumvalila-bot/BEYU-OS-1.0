import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/Chrome";
import {
  fetchOrganizations,
  fetchTenants,
  fetchOrganizationMembers,
  fetchProfiles,
  fetchRoles,
  fetchPermissions,
  fetchAuditEvents,
  fetchDocuments,
  fetchFhirResources,
  fetchNhifClaims,
  type OrganizationRow,
  type TenantRow,
  type OrganizationMemberRow,
  type ProfileRow,
  type RoleRow,
  type PermissionRow,
  type AuditEventRow,
  type DocumentRow,
  type FhirResourceRow,
  type NhifClaimRow,
} from "../services/supabase";

const tabs = [
  { key: "organizations", label: "Organizations" },
  { key: "tenants", label: "Tenants" },
  { key: "members", label: "Members" },
  { key: "profiles", label: "Profiles" },
  { key: "roles", label: "Roles" },
  { key: "permissions", label: "Permissions" },
  { key: "audit", label: "Audit" },
  { key: "documents", label: "Documents" },
  { key: "fhir", label: "FHIR" },
  { key: "nhif", label: "NHIF Claims" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function formatValue(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function FoundationTablesScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>("organizations");
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [members, setMembers] = useState<OrganizationMemberRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [fhirResources, setFhirResources] = useState<FhirResourceRow[]>([]);
  const [nhifClaims, setNhifClaims] = useState<NhifClaimRow[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [orgs, tnts, mems, profs, rlz, perms, audits, docs, fhir, nhif] = await Promise.all([
        fetchOrganizations<OrganizationRow>(),
        fetchTenants<TenantRow>(),
        fetchOrganizationMembers<OrganizationMemberRow>(),
        fetchProfiles<ProfileRow>(),
        fetchRoles<RoleRow>(),
        fetchPermissions<PermissionRow>(),
        fetchAuditEvents<AuditEventRow>(),
        fetchDocuments<DocumentRow>(),
        fetchFhirResources<FhirResourceRow>(),
        fetchNhifClaims<NhifClaimRow>(),
      ]);

      setOrganizations(orgs.data ?? []);
      setTenants(tnts.data ?? []);
      setMembers(mems.data ?? []);
      setProfiles(profs.data ?? []);
      setRoles(rlz.data ?? []);
      setPermissions(perms.data ?? []);
      setAuditEvents(audits.data ?? []);
      setDocuments(docs.data ?? []);
      setFhirResources(fhir.data ?? []);
      setNhifClaims(nhif.data ?? []);
      setLoading(false);
    }

    void load();
  }, []);

  const activeRows = useMemo(() => {
    switch (activeTab) {
      case "tenants": return tenants;
      case "members": return members;
      case "profiles": return profiles;
      case "roles": return roles;
      case "permissions": return permissions;
      case "audit": return auditEvents;
      case "documents": return documents;
      case "fhir": return fhirResources;
      case "nhif": return nhifClaims;
      default: return organizations;
    }
  }, [activeTab, organizations, tenants, members, profiles, roles, permissions, auditEvents, documents, fhirResources, nhifClaims]);

  const columns = useMemo(() => {
    if (activeRows.length === 0) return [] as string[];
    return Object.keys(activeRows[0] as Record<string, unknown>);
  }, [activeRows]);

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Shared Foundation Tables"
        subtitle="Organizations · tenants · members · profiles · roles · permissions · audit · documents · FHIR · NHIF"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${activeTab === tab.key ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading foundation tables…</div>
        ) : activeRows.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">No data available yet. Create the tables and seed them in Supabase to populate this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-3 py-2.5">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRows.map((row, index) => (
                  <tr key={`${activeTab}-${index}`} className="border-t border-slate-100 align-top">
                    {columns.map((column) => (
                      <td key={`${activeTab}-${column}-${index}`} className="max-w-[260px] px-3 py-2.5 text-slate-700">
                        <div className="break-words">{formatValue((row as Record<string, unknown>)[column])}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
