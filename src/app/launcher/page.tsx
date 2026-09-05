/**
 * BEYU OS Launcher
 *
 * Smart routing component that displays authorized OSs for the current user.
 * - 1 authorized OS → direct routing (handled by root page)
 * - Multiple authorized OSs → this launcher
 * - No authorization → deny/fail-closed
 */

import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";

export default async function LauncherPage() {
  const principal = await resolvePrincipal();

  // Unauthenticated → redirect to sign-in
  if (!principal) {
    redirect("/");
  }

  // Resolve authorized OSs
  const authorizedOSs: Array<{
    code: string;
    name: string;
    description: string;
    href: string;
    icon: string;
    authorized: boolean;
  }> = [];

  // BEYU OS: Always authorized if user has a valid session
  authorizedOSs.push({
    code: "BEYU",
    name: "BEYU OS",
    description: "Control Plane — Governance, Finance, HCM, Noelia AI",
    href: "/os",
    icon: "🏛️",
    authorized: true,
  });

  // Health OS: Check canonical identity link
  const healthAuth = await checkHealthOSAuthorization(principal.userId);
  if (healthAuth.authorized) {
    authorizedOSs.push({
      code: "HEALTH",
      name: "Health OS",
      description: "Healthcare Sector — Clinical, Patient Care, Operations",
      href: "/health",
      icon: "🏥",
      authorized: true,
    });
  }

  // Agriculture OS: Future
  // Not implemented yet

  const authorizedCount = authorizedOSs.filter((os) => os.authorized).length;

  // If only one OS is authorized, redirect directly
  if (authorizedCount === 1) {
    const singleOS = authorizedOSs.find((os) => os.authorized);
    if (singleOS) {
      redirect(singleOS.href);
    }
  }

  // If no OSs are authorized, show access denied
  if (authorizedCount === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-md mx-auto text-center p-8">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6">
            You are not authorized to access any operating system.
          </p>
          <a
            href="/api/v1/auth/logout"
            className="inline-block px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Sign Out
          </a>
        </div>
      </div>
    );
  }

  // Multiple OSs authorized → show launcher
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            Welcome, {principal.displayName}
          </h1>
          <p className="text-lg text-slate-600">
            Select an operating system to continue
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-200 rounded-full">
            <span className="text-sm font-medium text-slate-700">
              {principal.email}
            </span>
          </div>
        </div>

        {/* OS Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {authorizedOSs.filter(os => os.authorized).map((os) => (
            <a
              key={os.code}
              href={os.href}
              className="group relative bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-slate-200 hover:border-slate-300"
            >
              {/* Icon */}
              <div className="absolute top-6 right-6 text-5xl opacity-10 group-hover:opacity-20 transition-opacity">
                {os.icon}
              </div>

              {/* Content */}
              <div className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl">{os.icon}</div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 group-hover:text-slate-700">
                      {os.name}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {os.code}
                      </span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      <span className="text-xs text-slate-500">
                        Operating System
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-slate-600 mb-6">{os.description}</p>

                {/* CTA */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900 group-hover:text-slate-700">
                    Launch OS
                  </span>
                  <svg
                    className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </div>
              </div>

              {/* Hover gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            </a>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-slate-500">
          <p>
            Tenant: <span className="font-medium">{principal.tenantCode}</span>
          </p>
          <p className="mt-1">
            Authorization resolved at {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
