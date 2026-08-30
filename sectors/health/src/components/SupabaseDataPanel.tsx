import { useEffect, useMemo, useState } from "react";
import { fetchFromTable } from "../services/supabase";

interface TableRecord {
  id?: string | number;
  [key: string]: unknown;
}

interface TableState {
  loading: boolean;
  error: string | null;
  rows: TableRecord[];
}

const initialState: TableState = {
  loading: true,
  error: null,
  rows: [],
};

export function SupabaseDataPanel() {
  const [patients, setPatients] = useState<TableState>(initialState);
  const [appointments, setAppointments] = useState<TableState>(initialState);
  const [users, setUsers] = useState<TableState>(initialState);

  useEffect(() => {
    const loadTable = async (table: "patients" | "appointments" | "users", setter: (value: TableState) => void) => {
      setter({ loading: true, error: null, rows: [] });
      const { data, error } = await fetchFromTable<TableRecord>(table, "*", { limit: 8 });
      if (error) {
        setter({ loading: false, error: error.message, rows: [] });
        return;
      }
      setter({ loading: false, error: null, rows: data ?? [] });
    };

    void loadTable("patients", setPatients);
    void loadTable("appointments", setAppointments);
    void loadTable("users", setUsers);
  }, []);

  const summary = useMemo(() => [
    { label: "Patients", count: patients.rows.length, state: patients },
    { label: "Appointments", count: appointments.rows.length, state: appointments },
    { label: "Users", count: users.rows.length, state: users },
  ], [appointments, patients, users]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Supabase data preview</h3>
          <p className="text-sm text-slate-600">Connected tables: patients, appointments, and users.</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {summary.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm text-slate-600">{item.label}</div>
            <div className="text-2xl font-semibold text-slate-900">{item.count}</div>
            <div className="text-xs text-slate-500">{item.state.loading ? "Loading…" : item.state.error ? "Error" : "Loaded"}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { title: "Patients", state: patients },
          { title: "Appointments", state: appointments },
          { title: "Users", state: users },
        ].map((section) => (
          <div key={section.title} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 font-medium text-slate-800">{section.title}</div>
            {section.state.loading && <div className="text-sm text-slate-500">Loading records…</div>}
            {section.state.error && <div className="text-sm text-rose-600">{section.state.error}</div>}
            {!section.state.loading && !section.state.error && section.state.rows.length === 0 && (
              <div className="text-sm text-slate-500">No rows returned.</div>
            )}
            <div className="space-y-2">
              {section.state.rows.map((row, index) => (
                <div key={`${section.title}-${index}`} className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                  <pre className="whitespace-pre-wrap break-words font-sans">{JSON.stringify(row, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
