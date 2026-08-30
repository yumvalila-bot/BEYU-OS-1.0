export interface SupabaseStatus {

  configured: boolean;
  connected: boolean;
  message: string;
}

export interface OrganizationRow {
  id?: string;
  organization_name?: string;
  organization_type?: string;
  slug?: string;
  status?: string;
  country_code?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TenantRow {
  id?: string;
  organization_id?: string;
  tenant_name?: string;
  tenant_code?: string;
  tenant_type?: string;
  status?: string;
  settings?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationMemberRow {
  id?: string;
  organization_id?: string;
  tenant_id?: string;
  user_id?: string;
  role?: string;
  invited_by?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileRow {
  id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  organization_id?: string;
  tenant_id?: string;
  avatar_url?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RoleRow {
  id?: string;
  tenant_id?: string;
  role_name?: string;
  description?: string;
  created_at?: string;
}

export interface PermissionRow {
  id?: string;
  role_id?: string;
  resource?: string;
  action?: string;
  created_at?: string;
}

export interface AuditEventRow {
  id?: string;
  organization_id?: string;
  tenant_id?: string;
  table_name?: string;
  record_id?: string;
  action?: string;
  actor_id?: string;
  actor_role?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface DocumentRow {
  id?: string;
  organization_id?: string;
  tenant_id?: string;
  owner_id?: string;
  document_type?: string;
  bucket_name?: string;
  object_name?: string;
  mime_type?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface FhirResourceRow {
  id?: string;
  organization_id?: string;
  tenant_id?: string;
  resource_type?: string;
  external_id?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface NhifClaimRow {
  id?: string;
  organization_id?: string;
  tenant_id?: string;
  patient_id?: string;
  claim_reference?: string;
  status?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

import { getAccessToken } from './auth';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';
const API_SUPABASE_BASE = `${API_BASE_URL}/api/supabase`;

async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const url = `${API_SUPABASE_BASE}${path}`;
  const token = getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, { ...init, headers, credentials: 'include' });
  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String((body as Record<string, unknown>).message)
      : response.statusText || `Request failed with status ${response.status}`;
    return { data: null as T | null, error: new Error(message) };
  }

  return { data: body as T, error: null as Error | null };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(API_SUPABASE_BASE);
}

export async function getSupabaseHealth(): Promise<SupabaseStatus> {
  const { data, error } = await apiRequest<SupabaseStatus>('/health');

  if (error || !data) {
    return {
      configured: false,
      connected: false,
      message: error?.message ?? 'Backend Supabase proxy is not available.',
    };
  }

  return data;
}

export async function fetchFromTable<T>(
  table: string,
  _columns = '*',
  options?: { limit?: number; orderBy?: string; ascending?: boolean },
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.orderBy) params.set('orderBy', options.orderBy);
  if (options?.ascending !== undefined) params.set('ascending', String(options.ascending));

  const query = params.toString();
  const { data, error } = await apiRequest<T[]>(`/${encodeURIComponent(table)}${query ? `?${query}` : ''}`);
  return { data, error };
}

export async function insertIntoTable<T>(table: string, payload: Record<string, unknown>) {
  const { data, error } = await apiRequest<T>(`/${encodeURIComponent(table)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return { data, error };
}

export async function fetchOrganizations<T>() {
  return fetchFromTable<T>('organizations', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchTenants<T>() {
  return fetchFromTable<T>('tenants', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchOrganizationMembers<T>() {
  return fetchFromTable<T>('organization_members', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchProfiles<T>() {
  return fetchFromTable<T>('profiles', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchRoles<T>() {
  return fetchFromTable<T>('roles', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchPermissions<T>() {
  return fetchFromTable<T>('permissions', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchAuditEvents<T>() {
  return fetchFromTable<T>('audit_events', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchDocuments<T>() {
  return fetchFromTable<T>('documents', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchFhirResources<T>() {
  return fetchFromTable<T>('fhir_resources', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchNhifClaims<T>() {
  return fetchFromTable<T>('nhif_claims', '*', { orderBy: 'created_at', ascending: false });
}

export async function fetchPatientDetails<T>(patientId: string) {
  const { data, error } = await apiRequest<T>(`/patients/${encodeURIComponent(patientId)}?expand=appointments`);
  return { data, error };
}

export async function updateTableRow<T>(table: string, id: string, payload: Record<string, unknown>) {
  const { data, error } = await apiRequest<T>(`/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  return { data, error };
}

export async function deleteTableRow(table: string, id: string) {
  const { error } = await apiRequest<unknown>(`/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return { error };
}
