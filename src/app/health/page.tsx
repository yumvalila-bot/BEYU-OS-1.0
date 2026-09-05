/**
 * Health OS Entry Point
 *
 * This page serves as the entry point to Health OS from the BEYU OS control plane.
 * Health OS is a separate application surface that consumes canonical BEYU identity
 * through federation.
 *
 * In production, this would redirect to the Health Web application deployed at
 * a separate domain/port. For now, it shows an information page.
 */

import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";

export default async function HealthOSPage() {
  const principal = await resolvePrincipal();

  // Unauthenticated → redirect to sign-in
  if (!principal) {
    redirect("/");
  }

  // Check Health OS authorization
  const healthAuth = await checkHealthOSAuthorization(principal.userId);

  if (!healthAuth.authorized) {
    // No canonical identity link → access denied
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-md mx-auto text-center p-8">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6">
            You do not have authorization to access Health OS.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Health OS access requires a canonical identity link established through
            the BEYU identity federation system.
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="/launcher"
              className="px-6 py-3 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition-colors"
            >
              Back to Launcher
            </a>
            <a
              href="/api/v1/auth/logout"
              className="px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              Sign Out
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Health OS authorized
  // In production, this would redirect to the Health Web application
  // For now, show an information page

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="text-6xl mb-4">🏥</div>
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Health OS</h1>
          <p className="text-lg text-slate-600">
            Healthcare Sector Operating System
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-100 rounded-full">
            <span className="text-sm font-medium text-blue-900">
              Authorized
            </span>
          </div>
        </div>

        {/* Information Card */}
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Health OS Access
          </h2>
          <p className="text-slate-600 mb-6">
            You are authorized to access Health OS. This sector operating system
            provides healthcare-specific capabilities including:
          </p>
          <ul className="space-y-3 mb-6">
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold">•</span>
              <span className="text-slate-700">Clinical operations (EMR, prescriptions, radiology, lab)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold">•</span>
              <span className="text-slate-700">Patient care management</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold">•</span>
              <span className="text-slate-700">Healthcare governance and compliance</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold">•</span>
              <span className="text-slate-700">Security operations</span>
            </li>
          </ul>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900">
              <strong>Architecture Note:</strong> Health OS is a separate application surface
              that consumes your canonical BEYU identity through federation. Your Health sector
              credentials are linked to your canonical BEYU GlobalUserID, ensuring unified
              identity across all operating systems.
            </p>
          </div>

          <div className="flex gap-3">
            <a
              href="/launcher"
              className="flex-1 px-6 py-3 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition-colors text-center"
            >
              Back to Launcher
            </a>
            <button
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              disabled
            >
              Launch Health OS (Coming Soon)
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-slate-500">
          <p>
            Canonical Identity: <span className="font-mono">{principal.userId}</span>
          </p>
          <p className="mt-1">
            Tenant: <span className="font-medium">{principal.tenantCode}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
