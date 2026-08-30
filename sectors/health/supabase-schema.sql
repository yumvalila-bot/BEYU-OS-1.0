-- Supabase SQL schema for patients, appointments, and users
-- Run this in the SQL editor in your Supabase project.

create extension if not exists "uuid-ossp";

create table if not exists public.patients (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  sex text,
  nhif_number text,
  mrn text unique,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.appointments (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references public.patients(id) on delete set null,
  appointment_date timestamptz not null,
  department text,
  doctor_name text,
  appointment_type text,
  status text default 'scheduled',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text unique,
  role text not null default 'staff',
  department text,
  phone text,
  active boolean default true,
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

create trigger patients_set_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- Optional sample data for quick testing
insert into public.patients (full_name, email, phone, date_of_birth, sex, nhif_number, mrn, status)
values
  ('Amina Hassan', 'amina@example.com', '+255712000001', '1992-03-14', 'Female', 'NHIF001', 'MRN-1001', 'active'),
  ('Erick Mushi', 'erick@example.com', '+255712000002', '1988-07-22', 'Male', 'NHIF002', 'MRN-1002', 'active')
on conflict (mrn) do nothing;

insert into public.users (full_name, email, role, department, phone, active)
values
  ('Dr. Neema Mwangi', 'neema@example.com', 'doctor', 'Cardiology', '+255713111111', true),
  ('Grace Mushi', 'grace@example.com', 'nurse', 'Emergency', '+255713222222', true)
on conflict (email) do nothing;

insert into public.appointments (patient_id, appointment_date, department, doctor_name, appointment_type, status, notes)
select id, '2026-07-20T09:00:00+00:00'::timestamptz, 'Cardiology', 'Dr. Neema Mwangi', 'consultation', 'scheduled', 'Follow-up visit'
from public.patients where mrn = 'MRN-1001'
on conflict do nothing;
