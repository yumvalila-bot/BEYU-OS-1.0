-- Enterprise Supabase schema starter for BEYU Health OS
-- This file provides the shared foundation for multi-tenant healthcare data.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  organization_type text not null,
  slug text unique,
  status text default 'active',
  country_code text default 'TZ',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_name text not null,
  tenant_code text unique,
  tenant_type text not null,
  status text default 'active',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique,
  phone text,
  role text default 'staff',
  organization_id uuid references public.organizations(id),
  tenant_id uuid references public.tenants(id),
  avatar_url text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff',
  invited_by uuid references auth.users(id),
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, tenant_id, user_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  role_name text not null,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references public.roles(id) on delete cascade,
  resource text not null,
  action text not null,
  created_at timestamptz default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null,
  actor_id uuid references auth.users(id),
  actor_role text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.fhir_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  resource_type text not null,
  external_id text,
  payload jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  owner_id uuid references auth.users(id),
  document_type text not null,
  bucket_name text not null,
  object_name text not null,
  mime_type text,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.nhif_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  patient_id uuid,
  claim_reference text unique,
  status text default 'draft',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create or replace trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

create or replace trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

create or replace trigger fhir_resources_set_updated_at
before update on public.fhir_resources
for each row execute function public.set_updated_at();

create or replace trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create or replace trigger nhif_claims_set_updated_at
before update on public.nhif_claims
for each row execute function public.set_updated_at();

-- Enable RLS for the shared foundation tables.
alter table public.organizations enable row level security;
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_events enable row level security;
alter table public.fhir_resources enable row level security;
alter table public.documents enable row level security;
alter table public.nhif_claims enable row level security;

-- Example policies. Replace with your full organization-specific policy matrix.
create policy if not exists organizations_select on public.organizations
for select using (auth.role() = 'authenticated');

create policy if not exists tenants_select on public.tenants
for select using (auth.role() = 'authenticated');

create policy if not exists profiles_self on public.profiles
for select using (auth.uid() = id);

create policy if not exists profiles_update_self on public.profiles
for update using (auth.uid() = id);

create policy if not exists documents_select on public.documents
for select using (auth.role() = 'authenticated');

create policy if not exists audit_events_insert on public.audit_events
for insert with check (auth.role() = 'authenticated');

create policy if not exists fhir_resources_select on public.fhir_resources
for select using (auth.role() = 'authenticated');

create policy if not exists nhif_claims_select on public.nhif_claims
for select using (auth.role() = 'authenticated');
