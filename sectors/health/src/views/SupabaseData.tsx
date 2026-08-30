import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/Chrome";
import { deleteTableRow, fetchFromTable, fetchPatientDetails, insertIntoTable, updateTableRow } from "../services/supabase";

type TableKey = "patients" | "appointments" | "users";

type RecordRow = Record<string, unknown>;

interface TableState {
  loading: boolean;
  error: string | null;
  rows: RecordRow[];
}

interface PatientDetailState {
  loading: boolean;
  error: string | null;
  patient: RecordRow | null;
}

interface FormErrors {
  [key: string]: string;
}

const initialState: TableState = {
  loading: true,
  error: null,
  rows: [],
};

const tabs: Array<{ key: TableKey; label: string; description: string }> = [
  { key: "patients", label: "Patients", description: "Core registry and demographics" },
  { key: "appointments", label: "Appointments", description: "Care scheduling and visit flow" },
  { key: "users", label: "Users", description: "Staff and role access records" },
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function getInitialPatientForm() {
  return {
    full_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    sex: "",
    nhif_number: "",
    mrn: "",
    status: "active",
  };
}

function getInitialAppointmentForm() {
  return {
    patient_id: "",
    appointment_date: "",
    department: "",
    doctor_name: "",
    appointment_type: "consultation",
    status: "scheduled",
    notes: "",
  };
}

function validatePatientForm(form: Record<string, unknown>): FormErrors {
  const errors: FormErrors = {};
  if (!String(form.full_name ?? "").trim()) errors.full_name = "Full name is required.";
  if (!String(form.mrn ?? "").trim()) errors.mrn = "MRN is required.";
  if (String(form.email ?? "").trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email))) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}

function validateAppointmentForm(form: Record<string, unknown>): FormErrors {
  const errors: FormErrors = {};
  if (!String(form.patient_id ?? "").trim()) errors.patient_id = "Patient ID is required.";
  if (!String(form.appointment_date ?? "").trim()) errors.appointment_date = "Appointment date is required.";
  return errors;
}

function validateEditForm(table: TableKey, form: Record<string, unknown>): FormErrors {
  if (table === "patients") return validatePatientForm(form);
  if (table === "appointments") return validateAppointmentForm(form);
  const errors: FormErrors = {};
  if (!String(form.full_name ?? "").trim()) errors.full_name = "Name is required.";
  if (!String(form.email ?? "").trim()) errors.email = "Email is required.";
  return errors;
}

export function SupabaseDataScreen() {
  const [activeTab] = useState<TableKey>("patients");
  const [tables, setTables] = useState<Record<TableKey, TableState>>({
    patients: initialState,
    appointments: initialState,
    users: initialState,
  });
  const [patientForm, setPatientForm] = useState(getInitialPatientForm());
  const [appointmentForm, setAppointmentForm] = useState(getInitialAppointmentForm());
  const [patientDetail, setPatientDetail] = useState<PatientDetailState>({ loading: false, error: null, patient: null });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDirection, setSortDirection] = useState("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RecordRow | null>(null);
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [patientFormErrors, setPatientFormErrors] = useState<FormErrors>({});
  const [appointmentFormErrors, setAppointmentFormErrors] = useState<FormErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<{ table: TableKey; rowId: string; label: string } | null>(null);
  const [appointmentEditId, setAppointmentEditId] = useState<string | null>(null);
  const [appointmentEditForm, setAppointmentEditForm] = useState<RecordRow | null>(null);
  const [appointmentEditErrors, setAppointmentEditErrors] = useState<FormErrors>({});

  const loadTables = async () => {
    const tablesToLoad: TableKey[] = ["patients", "appointments", "users"];
    await Promise.all(tablesToLoad.map(async (table) => {
      setTables((current) => ({ ...current, [table]: { loading: true, error: null, rows: [] } }));
      const { data, error } = await fetchFromTable<RecordRow>(table, "*", { limit: 25 });
      setTables((current) => ({
        ...current,
        [table]: {
          loading: false,
          error: error ? error.message : null,
          rows: data ?? [],
        },
      }));
    }));
  };

  useEffect(() => {
    void loadTables();
  }, []);

  const current = tables[activeTab];

  const linkedAppointments: RecordRow[] =
    patientDetail.patient && Array.isArray((patientDetail.patient as RecordRow).appointments)
      ? ((patientDetail.patient as RecordRow).appointments as RecordRow[])
      : [];

  const columns = useMemo(() => {
    const values = new Set<string>();
    current.rows.forEach((row) => Object.keys(row).forEach((key) => values.add(key)));
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [current.rows]);

  const filteredRows = useMemo(() => {
    const rows = activeTab === "patients"
      ? current.rows.filter((row) => filter === "all" ? true : String(row.status || "active") === filter)
      : current.rows;

    const query = search.trim().toLowerCase();
    const searched = query
      ? rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(query)))
      : rows;

    return [...searched].sort((left, right) => {
      const leftValue = String(left[sortBy as keyof RecordRow] ?? "");
      const rightValue = String(right[sortBy as keyof RecordRow] ?? "");
      const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [activeTab, current.rows, filter, search, sortBy, sortDirection]);

  const summaryCards = useMemo(() => {
    const patients = tables.patients.rows;
    const appointments = tables.appointments.rows;
    const users = tables.users.rows;
    return [
      { label: "Patients", value: patients.length, detail: `${patients.filter((row) => String(row.status || "active") === "active").length} active` },
      { label: "Appointments", value: appointments.length, detail: `${appointments.filter((row) => String(row.status || "scheduled") === "scheduled").length} scheduled` },
      { label: "Users", value: users.length, detail: `${users.filter((row) => String(row.active ?? true) === "true").length} active` },
    ];
  }, [tables]);

  const handlePatientSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    const errors = validatePatientForm(patientForm);
    setPatientFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const { data, error } = await insertIntoTable<RecordRow>("patients", patientForm);
    if (error) {
      setStatusMessage(`Patient create failed: ${error.message}`);
      return;
    }
    setStatusMessage(`Patient created successfully: ${data?.full_name ?? "New patient"}`);
    setPatientForm(getInitialPatientForm());
    setPatientFormErrors({});
    void loadTables();
  };

  const handleAppointmentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    const errors = validateAppointmentForm(appointmentForm);
    setAppointmentFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const { data, error } = await insertIntoTable<RecordRow>("appointments", appointmentForm);
    if (error) {
      setStatusMessage(`Appointment create failed: ${error.message}`);
      return;
    }
    setStatusMessage(`Appointment created successfully: ${data?.appointment_type ?? "New appointment"}`);
    setAppointmentForm(getInitialAppointmentForm());
    setAppointmentFormErrors({});
    void loadTables();
  };

  const handleViewPatient = async (patientId: string) => {
    setPatientDetail({ loading: true, error: null, patient: null });
    const { data, error } = await fetchPatientDetails<RecordRow>(patientId);
    setPatientDetail({ loading: false, error: error ? error.message : null, patient: data ?? null });
  };

  const startEdit = (row: RecordRow) => {
    setEditingId(String(row.id ?? ""));
    setEditForm({ ...row });
    setEditErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setEditErrors({});
  };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    setStatusMessage(null);
    const errors = validateEditForm(activeTab, editForm);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const { error } = await updateTableRow<RecordRow>(activeTab, editingId, editForm);
    if (error) {
      setStatusMessage(`Update failed: ${error.message}`);
      return;
    }
    setStatusMessage("Record updated successfully.");
    setEditingId(null);
    setEditForm(null);
    setEditErrors({});
    void loadTables();
  };

  const requestDelete = (table: TableKey, rowId: string, label: string) => {
    setDeleteTarget({ table, rowId, label });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setStatusMessage(null);
    const { error } = await deleteTableRow(deleteTarget.table, deleteTarget.rowId);
    if (error) {
      setStatusMessage(`Delete failed: ${error.message}`);
      setDeleteTarget(null);
      return;
    }
    setStatusMessage(`Record deleted successfully: ${deleteTarget.label}`);
    setDeleteTarget(null);
    void loadTables();
  };

  const startAppointmentEdit = (appointment: RecordRow) => {
    setAppointmentEditId(String(appointment.id ?? ""));
    setAppointmentEditForm({ ...appointment });
    setAppointmentEditErrors({});
  };

  const cancelAppointmentEdit = () => {
    setAppointmentEditId(null);
    setAppointmentEditForm(null);
    setAppointmentEditErrors({});
  };

  const saveAppointmentEdit = async () => {
    if (!appointmentEditId || !appointmentEditForm) return;
    setStatusMessage(null);
    const errors = validateAppointmentForm(appointmentEditForm);
    setAppointmentEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const { error } = await updateTableRow<RecordRow>("appointments", appointmentEditId, appointmentEditForm);
    if (error) {
      setStatusMessage(`Appointment update failed: ${error.message}`);
      return;
    }
    setStatusMessage("Appointment updated successfully.");
    setAppointmentEditId(null);
    setAppointmentEditForm(null);
    setAppointmentEditErrors({});
    if (patientDetail.patient?.id) {
      await handleViewPatient(String(patientDetail.patient.id));
    }
    void loadTables();
  };

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Supabase Operations"
        subtitle="Create records, monitor counts, filter patients, and inspect details"
        actions={<span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Connected view</span>}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600">{card.label}</div>
            <div className="mt-1 text-3xl font-semibold text-navy-800">{card.value}</div>
            <div className="text-xs text-slate-500">{card.detail}</div>
          </div>
        ))}
      </div>

      {statusMessage && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{statusMessage}</div>
      )}

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handlePatientSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 text-lg font-semibold text-slate-900">Create patient</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <input required value={patientForm.full_name} onChange={(event) => setPatientForm({ ...patientForm, full_name: event.target.value })} placeholder="Full name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {patientFormErrors.full_name && <div className="mt-1 text-xs text-rose-600">{patientFormErrors.full_name}</div>}
            </div>
            <div>
              <input value={patientForm.email} onChange={(event) => setPatientForm({ ...patientForm, email: event.target.value })} placeholder="Email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {patientFormErrors.email && <div className="mt-1 text-xs text-rose-600">{patientFormErrors.email}</div>}
            </div>
            <input value={patientForm.phone} onChange={(event) => setPatientForm({ ...patientForm, phone: event.target.value })} placeholder="Phone" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={patientForm.date_of_birth} onChange={(event) => setPatientForm({ ...patientForm, date_of_birth: event.target.value })} placeholder="Date of birth" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={patientForm.sex} onChange={(event) => setPatientForm({ ...patientForm, sex: event.target.value })} placeholder="Sex" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={patientForm.nhif_number} onChange={(event) => setPatientForm({ ...patientForm, nhif_number: event.target.value })} placeholder="NHIF number" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <div>
              <input required value={patientForm.mrn} onChange={(event) => setPatientForm({ ...patientForm, mrn: event.target.value })} placeholder="MRN" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {patientFormErrors.mrn && <div className="mt-1 text-xs text-rose-600">{patientFormErrors.mrn}</div>}
            </div>
            <select value={patientForm.status} onChange={(event) => setPatientForm({ ...patientForm, status: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <button type="submit" className="mt-4 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white">Create patient</button>
        </form>

        <form onSubmit={handleAppointmentSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 text-lg font-semibold text-slate-900">Create appointment</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <input required value={appointmentForm.patient_id} onChange={(event) => setAppointmentForm({ ...appointmentForm, patient_id: event.target.value })} placeholder="Patient ID" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {appointmentFormErrors.patient_id && <div className="mt-1 text-xs text-rose-600">{appointmentFormErrors.patient_id}</div>}
            </div>
            <div>
              <input required value={appointmentForm.appointment_date} onChange={(event) => setAppointmentForm({ ...appointmentForm, appointment_date: event.target.value })} placeholder="Appointment date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {appointmentFormErrors.appointment_date && <div className="mt-1 text-xs text-rose-600">{appointmentFormErrors.appointment_date}</div>}
            </div>
            <input value={appointmentForm.department} onChange={(event) => setAppointmentForm({ ...appointmentForm, department: event.target.value })} placeholder="Department" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={appointmentForm.doctor_name} onChange={(event) => setAppointmentForm({ ...appointmentForm, doctor_name: event.target.value })} placeholder="Doctor name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <select value={appointmentForm.appointment_type} onChange={(event) => setAppointmentForm({ ...appointmentForm, appointment_type: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="consultation">Consultation</option>
              <option value="follow-up">Follow-up</option>
              <option value="lab">Lab</option>
              <option value="radiology">Radiology</option>
            </select>
            <select value={appointmentForm.status} onChange={(event) => setAppointmentForm({ ...appointmentForm, status: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <textarea value={appointmentForm.notes} onChange={(event) => setAppointmentForm({ ...appointmentForm, notes: event.target.value })} placeholder="Notes" className="col-span-full w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={3} />
          </div>
          <button type="submit" className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Create appointment</button>
        </form>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Patient registry</div>
                <div className="text-xs text-slate-500">Filter by status, search by text, and inspect details</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patients…" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {current.loading && <div className="p-6 text-sm text-slate-600">Loading records from Supabase…</div>}
          {!current.loading && current.error && <div className="p-6 text-sm text-rose-600">{current.error}</div>}
          {!current.loading && !current.error && (
            <div className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <div key={String(row.id ?? Math.random())} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="font-medium text-slate-900">{String(row.full_name ?? row.mrn ?? "Record")}</div>
                    <div className="text-sm text-slate-600">{String(row.email ?? row.department ?? "No extra details")}</div>
                    <div className="text-xs text-slate-500">MRN: {String(row.mrn ?? "—")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-600">{String(row.status ?? "active")}</span>
                    <button type="button" onClick={() => handleViewPatient(String(row.id))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">View</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-lg font-semibold text-slate-900">Patient profile</div>
          {patientDetail.loading && <div className="text-sm text-slate-600">Loading patient details…</div>}
          {!patientDetail.loading && patientDetail.error && <div className="text-sm text-rose-600">{patientDetail.error}</div>}
          {!patientDetail.loading && !patientDetail.error && !patientDetail.patient && <div className="text-sm text-slate-600">Select a patient to inspect their full profile and linked appointments.</div>}
          {!patientDetail.loading && !patientDetail.error && patientDetail.patient && (
            <div className="space-y-3 text-sm text-slate-700">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">{String(patientDetail.patient.full_name ?? "Patient")}</div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-emerald-700">{String(patientDetail.patient.status ?? "active")}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>MRN: {String(patientDetail.patient.mrn ?? "—")}</div>
                  <div>Email: {String(patientDetail.patient.email ?? "—")}</div>
                  <div>Phone: {String(patientDetail.patient.phone ?? "—")}</div>
                  <div>Sex: {String(patientDetail.patient.sex ?? "—")}</div>
                  <div>Date of birth: {String(patientDetail.patient.date_of_birth ?? "—")}</div>
                  <div>NHIF: {String(patientDetail.patient.nhif_number ?? "—")}</div>
                </div>
              </div>
              <div>
                <div className="mb-2 font-semibold text-slate-900">Linked appointments</div>
                {linkedAppointments.length > 0 ? (
                  <div className="space-y-2">
                    {linkedAppointments.map((appointment: RecordRow, index: number) => {
                      const isEditingAppointment = appointmentEditId === String(appointment.id ?? "");
                      return (
                        <div key={`${String(appointment.id ?? index)}`} className="rounded-lg border border-slate-200 p-2">
                          {isEditingAppointment && appointmentEditForm ? (
                            <div className="space-y-2">
                              <input value={String(appointmentEditForm.appointment_date ?? "")} onChange={(event) => setAppointmentEditForm({ ...appointmentEditForm, appointment_date: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                              <input value={String(appointmentEditForm.department ?? "")} onChange={(event) => setAppointmentEditForm({ ...appointmentEditForm, department: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                              <input value={String(appointmentEditForm.doctor_name ?? "")} onChange={(event) => setAppointmentEditForm({ ...appointmentEditForm, doctor_name: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                              <select value={String(appointmentEditForm.status ?? "scheduled")} onChange={(event) => setAppointmentEditForm({ ...appointmentEditForm, status: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm">
                                <option value="scheduled">Scheduled</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                              {appointmentEditErrors.appointment_date && <div className="text-xs text-rose-600">{appointmentEditErrors.appointment_date}</div>}
                              <div className="flex gap-2">
                                <button type="button" onClick={saveAppointmentEdit} className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white">Save</button>
                                <button type="button" onClick={cancelAppointmentEdit} className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="font-medium text-slate-800">{String(appointment.appointment_type ?? "Appointment")}</div>
                              <div className="text-xs text-slate-500">{String(appointment.appointment_date ?? "—")}</div>
                              <div className="text-xs text-slate-500">Department: {String(appointment.department ?? "—")}</div>
                              <div className="text-xs text-slate-500">Status: {String(appointment.status ?? "—")}</div>
                              <div className="mt-2 flex gap-2">
                                <button type="button" onClick={() => startAppointmentEdit(appointment)} className="rounded bg-navy-800 px-2.5 py-1 text-xs font-semibold text-white">Edit</button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No appointments linked yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{tabs.find((tab) => tab.key === activeTab)?.label}</div>
              <div className="text-xs text-slate-500">{tabs.find((tab) => tab.key === activeTab)?.description}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="created_at">Sort by created</option>
                <option value="full_name">Sort by name</option>
                <option value="mrn">Sort by MRN</option>
                <option value="appointment_date">Sort by date</option>
              </select>
              <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>
        </div>

        {current.loading && <div className="p-6 text-sm text-slate-600">Loading records from Supabase…</div>}
        {!current.loading && current.error && <div className="p-6 text-sm text-rose-600">{current.error}</div>}
        {!current.loading && !current.error && current.rows.length === 0 && <div className="p-6 text-sm text-slate-600">No records returned for this table yet.</div>}
        {!current.loading && !current.error && current.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-4 py-3">{column}</th>
                  ))}
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => {
                  const rowId = String(row.id ?? index);
                  const isEditing = editingId === rowId;
                  return (
                    <tr key={`${activeTab}-${rowId}`} className="border-t border-slate-100 hover:bg-slate-50">
                      {columns.map((column) => (
                        <td key={column} className="max-w-[220px] px-4 py-3 align-top text-slate-700">
                          {isEditing && editForm ? (
                            <div>
                              <input value={String(editForm[column] ?? "")} onChange={(event) => setEditForm({ ...editForm, [column]: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                              {editErrors[column] && <div className="mt-1 text-xs text-rose-600">{editErrors[column]}</div>}
                            </div>
                          ) : (
                            <div className="break-words">{formatValue(row[column])}</div>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        {isEditing && editForm ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={saveEdit} className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white">Save</button>
                            <button type="button" onClick={cancelEdit} className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => startEdit(row)} className="rounded bg-navy-800 px-2.5 py-1 text-xs font-semibold text-white">Edit</button>
                            <button type="button" onClick={() => requestDelete(activeTab, rowId, String(row.full_name ?? row.mrn ?? row.email ?? "record"))} className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white">Delete</button>
                            {activeTab === "patients" && (
                              <button type="button" onClick={() => handleViewPatient(rowId)} className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">View</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-lg font-semibold text-slate-900">Confirm delete</div>
            <div className="mt-2 text-sm text-slate-600">Delete {deleteTarget.label}? This action cannot be undone.</div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={confirmDelete} className="rounded bg-rose-600 px-3 py-2 text-sm font-semibold text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
