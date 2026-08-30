import { useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth/AuthContext";
import { Landing } from "./views/Landing";
import { Login } from "./views/Login";
import { Sidebar, TopBar, type NavItem } from "./components/Chrome";
import { AICoPilot } from "./components/AICoPilot";

import {
  CEODashboard,
  DoctorDashboard,
  NurseDashboard,
  PatientDashboard,
  AdminDashboard,
  PharmacyDashboard,
  LabDashboard,
  FinanceDashboard,
  ModulesScreen,
  GovernanceScreen,
} from "./views/Dashboards";

import {
  DentalDashboard,
  OncologyDashboard,
  PediatricsDashboard,
  ICUDashboard,
  TheatreDashboard,
  EmergencyDashboard,
  RadiologyDashboard,
  TelemedicineDashboard,
} from "./views/Clinical";

import { SmartContractsScreen } from "./views/SmartContracts";

import {
  PatientListScreen,
  NewRegistrationsScreen,
  AppointmentsScreen,
  MedicalReportsAIScreen,
  PrescriptionsScreen,
  MaternityScreen,
  HRScreen,
  DAOGovernanceScreen,
  SovereignEnterpriseScreen,
  HiveAIScreen,
  HISMTUHAScreen,
  TenantMigrationScreen,
  PlanningOwnersScreen,
  PublicHealthScreen,
  ResearchTrialsScreen,
} from "./views/ExtraScreens";

import { EnterpriseHierarchyScreen } from "./views/Hierarchy";
import { SettingsScreenImpl } from "./views/Settings";

import { EMRPatientChart } from "./views/EMR";

import {
  BillingScreen,
  InventoryScreen,
  AuditScreen,
  NotificationsScreen,
  ProfileScreen,
  OpCosScreen,
} from "./views/Final";

import {
  TrusteeDashboard,
  BoardDashboard,
} from "./views/Governance";

import { ApplicationsScreen } from "./views/Applications";
import { SecurityOpsScreen } from "./views/SecurityOps";
import { SecurityPostureBanner } from "./components/Security";

import { SupabaseDataPanel } from "./components/SupabaseDataPanel";

import { DepartmentCoverageTest } from "./views/DepartmentTest";
import { StandaloneBusinessTest } from "./views/StandaloneTest";

import { PatientFlowScreen } from "./views/PatientFlow";
import { VIPSchemeScreen } from "./views/VIPScheme";

import { ComplianceScreen } from "./views/Compliance";
import { TaxOrchestrationScreen } from "./views/TaxOrchestration";
import { NABHScreen } from "./views/NABH";

import { SupabaseDataScreen } from "./views/SupabaseData";
import { FoundationTablesScreen } from "./views/FoundationTables";

import { ROLES, TENANTS } from "./data/mock";

import {getSupabaseHealth,type SupabaseStatus} from "./services/supabase";

type Stage = "landing" | "login" | "app";

const ROLE_USERS: Record<string, { name: string; role: string }> = {
  trustee: { name: "Dr. John Doe", role: "Trustee · BEYU Family Trust" },
  board: { name: "Sarah Naidu", role: "Board Member · Acumen Nominee" },
  ceo: { name: "Dr. John Doe", role: "Chief Executive Officer" },
  doctor: { name: "Dr. Neema Mwangi", role: "Medical Officer" },
  nurse: { name: "Grace Mushi", role: "Senior Nurse · Ward A" },
  admin: { name: "Edith Sanga", role: "Hospital Administrator" },
  pharmacy: { name: "Ahmed Bakari", role: "Chief Pharmacist" },
  lab: { name: "Lucy Mtui", role: "Lab Technologist" },
  finance: { name: "Edith Sanga", role: "Chief Financial Officer" },
  patient: { name: "Neema Mwangi", role: "Patient · BEYU-100484" },
};

/**
 * Unified sidebar navigation — used by all internal roles.
 * Organized exactly per the spec:
 *   MAIN MENU · CLINICAL · DIAGNOSTICS · SYSTEM
 *
 * (Patients see a separate, narrower portal nav.)
 */
function navMain(): NavItem[] {
  return [
    // MAIN MENU
    { id: "home", label: "Dashboard", icon: "dashboard", group: "Main Menu" },
    { id: "apps", label: "BEYU Applications", icon: "device", group: "Main Menu", badge: "5" },
    { id: "patients-hub", label: "Patients", icon: "users", group: "Main Menu" },
    { id: "patient-list", label: "Patient List", icon: "users", group: "Main Menu", badge: "12.4k" },
    { id: "new-reg", label: "New Registrations", icon: "user", group: "Main Menu", badge: "42" },
    { id: "appointments", label: "Appointments", icon: "calendar", group: "Main Menu", badge: "127" },
    { id: "flow", label: "Patient Flow & VIP", icon: "zap", group: "Main Menu", badge: "Live" },
    { id: "vip-scheme", label: "VIP Scheme", icon: "star", group: "Main Menu", badge: "★" },
    { id: "reports-ai", label: "Medical Reports AI", icon: "brain", group: "Main Menu" },

    // CLINICAL
    { id: "emr", label: "EMR", icon: "emr", group: "Clinical" },
    { id: "prescriptions", label: "Prescriptions", icon: "pill", group: "Clinical" },

    // DIAGNOSTICS
    { id: "radiology", label: "Radiology", icon: "monitor", group: "Diagnostics" },
    { id: "lab", label: "Laboratory", icon: "lab", group: "Diagnostics" },
    { id: "pharmacy", label: "Pharmacy", icon: "pill", group: "Diagnostics" },
    { id: "er", label: "Emergency", icon: "zap", group: "Diagnostics" },
    { id: "maternity", label: "Maternity", icon: "heart", group: "Diagnostics" },

    // SYSTEM
    { id: "dental", label: "Dental", icon: "heart", group: "System" },
    { id: "vault", label: "Smart Contracts", icon: "doc", group: "System", badge: "⛓" },
    { id: "finance", label: "Finance", icon: "cash", group: "System" },
    { id: "billing", label: "Billing & RCM", icon: "bill", group: "System" },
    { id: "tax", label: "Tax Orchestrator", icon: "scale", group: "System", badge: "TZS" },
    { id: "inventory", label: "Inventory & Procurement", icon: "truck", group: "System" },
    { id: "hr", label: "Human Resources", icon: "users", group: "System" },
    { id: "opcos", label: "Operating Companies", icon: "building", group: "System", badge: "11" },
    { id: "dao", label: "DAO Governance", icon: "scale", group: "System" },
    { id: "sovereign", label: "Sovereign Enterprise", icon: "globe", group: "System" },
    { id: "hierarchy", label: "Enterprise Hierarchy", icon: "building", group: "System" },
    { id: "hive", label: "HIVE AI", icon: "brain", group: "System" },
    { id: "audit", label: "Audit & SIEM", icon: "shield", group: "System" },
    { id: "security", label: "Security Ops Center", icon: "lock", group: "System", badge: "🛡" },
    { id: "compliance", label: "Compliance Pack (TZ)", icon: "shield", group: "System", badge: "A–T" },
    { id: "nabh", label: "NABH Compliance", icon: "star", group: "System", badge: "★" },
    { id: "dept-test", label: "Department Coverage Test", icon: "check", group: "System", badge: "▶" },
    { id: "biz-test", label: "Standalone Business Test", icon: "building", group: "System", badge: "▶" },
    { id: "his-mtuha", label: "HIS / MTUHA", icon: "reports", group: "System" },
    { id: "migration", label: "Tenant Migration", icon: "database", group: "System" },
    { id: "planning", label: "Planning & Owners", icon: "star", group: "System" },
    { id: "public-health", label: "Public Health", icon: "shield", group: "System" },
    { id: "tele", label: "Telemedicine", icon: "phone", group: "System" },
    { id: "research", label: "Research & Trials", icon: "flask", group: "System" },
    { id: "settings", label: "Settings", icon: "settings", group: "System" },
    { id: "supabase-data", label: "Supabase Records", icon: "database", group: "System" },
    { id: "foundation-tables", label: "Foundation Tables", icon: "database", group: "System" },
  ];
}

function navPatient(): NavItem[] {
  return [
    { id: "home", label: "My Health", icon: "dashboard", group: "Main Menu" },
    { id: "apps", label: "BEYU Citizen App", icon: "device", group: "Main Menu", badge: "↗" },
    { id: "emr", label: "My Records", icon: "emr", group: "Main Menu" },
    { id: "appointments", label: "Appointments", icon: "calendar", group: "Main Menu" },
    { id: "prescriptions", label: "My Prescriptions", icon: "pill", group: "Main Menu" },
    { id: "lab", label: "Lab Results", icon: "lab", group: "Main Menu" },
    { id: "tele", label: "Telemedicine", icon: "phone", group: "Main Menu" },
    { id: "bill", label: "Billing & NHIF", icon: "bill", group: "Main Menu" },
    { id: "settings", label: "Settings & Consent", icon: "settings", group: "Main Menu" },
  ];
}

/** Trustee workspace — supreme constitutional authority, narrow-focused nav. */
function navTrustee(): NavItem[] {
  return [
    { id: "home", label: "Trustee Command", icon: "shield", group: "Constitutional" },
    { id: "apps", label: "BEYU Applications", icon: "device", group: "Constitutional", badge: "5" },
    { id: "vault", label: "Trust Deed & Vault", icon: "doc", group: "Constitutional", badge: "⛓" },
    { id: "hierarchy", label: "Enterprise Hierarchy", icon: "building", group: "Constitutional" },
    { id: "sovereign", label: "Sovereign Enterprise", icon: "globe", group: "Constitutional" },
    { id: "hive", label: "HIVE AI Oversight", icon: "brain", group: "Oversight" },
    { id: "audit", label: "Immutable Audit", icon: "shield", group: "Oversight" },
    { id: "security", label: "Security Operations", icon: "lock", group: "Oversight", badge: "🛡" },
    { id: "compliance", label: "Compliance Pack", icon: "shield", group: "Oversight", badge: "A–T" },
    { id: "nabh", label: "NABH Compliance", icon: "star", group: "Oversight", badge: "★" },
    { id: "dao", label: "DAO Governance", icon: "scale", group: "Oversight" },
    { id: "opcos", label: "Operating Companies", icon: "building", group: "Oversight", badge: "11" },
    { id: "vip-scheme", label: "VIP Scheme", icon: "star", group: "Oversight", badge: "★" },
    { id: "planning", label: "Strategic Roadmap", icon: "star", group: "Strategic" },
    { id: "settings", label: "Settings", icon: "settings", group: "Strategic" },
  ];
}

/** Board member workspace — strategic governance. */
function navBoard(): NavItem[] {
  return [
    { id: "home", label: "Board Room", icon: "scale", group: "Boardroom" },
    { id: "apps", label: "BEYU Applications", icon: "device", group: "Boardroom", badge: "5" },
    { id: "vault", label: "Board Documents", icon: "doc", group: "Boardroom", badge: "⛓" },
    { id: "planning", label: "Planning & Owners", icon: "star", group: "Boardroom" },
    { id: "opcos", label: "Operating Companies", icon: "building", group: "Performance", badge: "11" },
    { id: "vip-scheme", label: "VIP Scheme", icon: "star", group: "Performance", badge: "★" },
    { id: "finance", label: "Financial Intelligence", icon: "cash", group: "Performance" },
    { id: "tax", label: "Tax Orchestrator", icon: "scale", group: "Performance", badge: "TZS" },
    { id: "analytics", label: "Enterprise Analytics", icon: "analytics", group: "Performance" },
    { id: "dao", label: "DAO Governance", icon: "scale", group: "Governance" },
    { id: "audit", label: "Audit & SIEM", icon: "shield", group: "Governance" },
    { id: "security", label: "Security Operations", icon: "lock", group: "Governance", badge: "🛡" },
    { id: "compliance", label: "Compliance Pack", icon: "shield", group: "Governance", badge: "A–T" },
    { id: "nabh", label: "NABH Compliance", icon: "star", group: "Governance", badge: "★" },
    { id: "hierarchy", label: "Enterprise Hierarchy", icon: "building", group: "Governance" },
    { id: "settings", label: "Settings", icon: "settings", group: "Governance" },
  ];
}

export default function App() {
  const { status: authStatus, user: authUser, logout } = useAuth();
  const [stage, setStage] = useState<Stage>("landing");
  const [role, setRole] = useState<string>("ceo");
  const [tenant, setTenant] = useState<string>(TENANTS[0].id);
  const [active, setActive] = useState<string>("home");
  const [aiOpen, setAiOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatus>({
    configured: false,
    connected: false,
    message: "Checking Supabase connection…",
  });

  // Derive the app role from the server-issued role (never from client state).
  useEffect(() => {
    if (authStatus === "authenticated" && authUser?.role) {
      setRole(ROLES.some((r) => r.id === authUser.role) ? authUser.role : "ceo");
      setActive("home");
    }
  }, [authStatus, authUser]);

  useEffect(() => {
    let active = true;
    void getSupabaseHealth().then((status) => {
      if (active) setSupabaseStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  // Authentication gates — the app is only reachable when authenticated.
  if (authStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900 text-white">
        <div className="text-center">
          <div className="font-display text-xl tracking-wide">BEYU Health OS</div>
          <div className="mt-2 text-sm text-white/60">Restoring secure session…</div>
        </div>
      </div>
    );
  }
  if (authStatus === "unauthenticated") {
    if (stage === "landing") return <Landing onLogin={() => setStage("login")} />;
    return <Login onBack={() => setStage("landing")} />;
  }

  const items = useMemo(() => {
    if (role === "patient") return navPatient();
    if (role === "trustee") return navTrustee();
    if (role === "board") return navBoard();
    return navMain();
  }, [role]);
  const displayName = authUser?.displayName || authUser?.email || "User";
  const roleLabel = ROLES.find((r) => r.id === role)?.label || "User";
  const user = ROLE_USERS[role] || { name: displayName, role: roleLabel };

  // Role-specific home dashboard
  const homeView = () => {
    switch (role) {
      case "trustee": return <TrusteeDashboard />;
      case "board": return <BoardDashboard />;
      case "ceo": return <CEODashboard />;
      case "doctor": return <DoctorDashboard />;
      case "nurse": return <NurseDashboard />;
      case "admin": return <AdminDashboard />;
      case "pharmacy": return <PharmacyDashboard />;
      case "lab": return <LabDashboard />;
      case "finance": return <FinanceDashboard />;
      case "patient": return <PatientDashboard />;
      default: return <CEODashboard />;
    }
  };

  const view = () => {
    switch (active) {
      case "home": return homeView();

      // MAIN MENU
      case "apps": return <ApplicationsScreen />;
      case "patients-hub": return <AdminDashboard />;
      case "patient-list": return <PatientListScreen />;
      case "new-reg": return <NewRegistrationsScreen />;
      case "appointments": return <AppointmentsScreen />;
      case "flow": return <PatientFlowScreen />;
      case "vip-scheme": return <VIPSchemeScreen />;
      case "reports-ai": return <MedicalReportsAIScreen />;

      // CLINICAL
      case "emr": return role === "patient" ? <PatientDashboard /> : <EMRPatientChart />;
      case "prescriptions": return <PrescriptionsScreen />;

      // DIAGNOSTICS
      case "radiology": return <RadiologyDashboard />;
      case "lab": return <LabDashboard />;
      case "pharmacy": return <PharmacyDashboard />;
      case "er": return <EmergencyDashboard />;
      case "maternity": return <MaternityScreen />;

      // SYSTEM
      case "dental": return <DentalDashboard />;
      case "vault": return <SmartContractsScreen />;
      case "finance": return <FinanceDashboard />;
      case "hr": return <HRScreen />;
      case "dao": return <DAOGovernanceScreen />;
      case "sovereign": return <SovereignEnterpriseScreen />;
      case "hierarchy": return <EnterpriseHierarchyScreen />;
      case "hive": return <HiveAIScreen />;
      case "his-mtuha": return <HISMTUHAScreen />;
      case "migration": return <TenantMigrationScreen />;
      case "planning": return <PlanningOwnersScreen />;
      case "public-health": return <PublicHealthScreen />;
      case "tele": return <TelemedicineDashboard />;
      case "research": return <ResearchTrialsScreen />;
      case "settings": return <SettingsScreen />;
      case "supabase-data": return <SupabaseDataScreen />;
      case "foundation-tables": return <FoundationTablesScreen />;

      // Newly added system modules
      case "billing": return <BillingScreen />;
      case "tax": return <TaxOrchestrationScreen />;
      case "inventory": return <InventoryScreen />;
      case "audit": return <AuditScreen />;
      case "security": return <SecurityOpsScreen currentRole={role} />;
      case "compliance": return <ComplianceScreen />;
      case "nabh": return <NABHScreen />;
      case "dept-test": return <DepartmentCoverageTest />;
      case "biz-test": return <StandaloneBusinessTest />;
      case "opcos": return <OpCosScreen />;

      // Topbar-driven screens
      case "notifications": return <NotificationsScreen />;
      case "profile": return <ProfileScreen name={user.name} role={user.role} />;

      // Patient portal aliases
      case "bill": return <PatientDashboard />;

      // Legacy / fallthroughs
      case "modules": return <ModulesScreen />;
      case "governance": return <GovernanceScreen />;
      case "admin": return <AdminDashboard />;
      case "oncology": return <OncologyDashboard />;
      case "pediatrics": return <PediatricsDashboard />;
      case "icu": return <ICUDashboard />;
      case "theatre": return <TheatreDashboard />;

      default: return homeView();
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        items={items}
        active={active}
        onSelect={setActive}
        onExit={() => void logout()}
        roleLabel={roleLabel}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main className="flex-1 min-w-0">
        <TopBar
          user={{ name: user.name, role: user.role }}
          tenantId={tenant}
          onTenantChange={setTenant}
          onOpenAI={() => setAiOpen(true)}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenNotifications={() => setActive("notifications")}
          onOpenProfile={() => setActive("profile")}
        />
        <div className="px-4 lg:px-6 pt-4 space-y-3">
          <SecurityPostureBanner role={role} tenantName={TENANTS.find((t) => t.id === tenant)?.name || ""} />
          <div className={`rounded-xl border px-4 py-3 text-sm ${supabaseStatus.connected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : supabaseStatus.configured ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700"}`}>
            <div className="font-semibold">Supabase status</div>
            <div>{supabaseStatus.message}</div>
          </div>
          <SupabaseDataPanel />
        </div>
        <div className="slidein">{view()}</div>
      </main>
      <AICoPilot open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}

function SettingsScreen() {
  return <SettingsScreenImpl />;
}
