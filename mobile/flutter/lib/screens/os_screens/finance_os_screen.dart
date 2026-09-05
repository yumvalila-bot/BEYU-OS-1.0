/// BEYU OS Mobile — Finance OS Screen
/// 
/// Canonical mobile interface for Finance OS operations:
/// - General Ledger & Posting Engine status (CAP_POSTING fail-closed gate)
/// - Capital requests & commitments
/// - Treasury & bank positions
/// - Waterfall distribution engine summary
/// - Tax strategy intelligence
/// - Accounting periods & reconciliation assurance
/// 
/// SECURITY PROPERTIES:
/// - Tenant and entity isolated
/// - Re-evaluates permissions server-side
/// - Cannot bypass fail-closed capability gates
/// - All mutations are API-only and strictly audited

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class FinanceOSScreen extends StatelessWidget {
  const FinanceOSScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final permissions = auth.session?.permissions ?? [];

    final hasLedgerRead = permissions.contains('finance:ledger.read');
    final hasCapitalRead = permissions.contains('finance:capital.read');
    final hasTreasuryRead = permissions.contains('finance:treasury.read');
    final hasWaterfallRead = permissions.contains('finance:waterfall.read');
    final hasTaxRead = permissions.contains('finance:tax.read');

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.account_balance, color: Color(0xFFD4AF37)),
            SizedBox(width: 8),
            Text('Finance OS'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Security / Gate Banner
            Card(
              color: Colors.amber.shade900.withOpacity(0.2),
              shape: RoundedRectangleBorder(
                side: BorderSide(color: Colors.amber.shade700.withOpacity(0.5)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Padding(
                padding: EdgeInsets.all(12),
                child: Row(
                  children: [
                    Icon(Icons.lock, color: Colors.amber, size: 24),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'CAP_POSTING Gate: LOCKED',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.amber,
                              fontSize: 13,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Posting engine is fail-closed pending CFO/ARB accounting policy ratification.',
                            style: TextStyle(fontSize: 11, color: Colors.white70),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Tenant Scope Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Financial Context',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Tenant: ${auth.session?.tenantCode ?? "N/A"} (${auth.session?.tenantType ?? "UNKNOWN"})',
                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                    Text(
                      'Clearance: ${auth.session?.clearance ?? "N/A"}',
                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                    Text(
                      'Entity Scope: ${(auth.session?.entityScope?.isEmpty ?? true) ? "All in-tenant entities" : auth.session!.entityScope!.join(", ")}',
                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Modules Section
            const Text(
              'Finance OS Modules',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white70),
            ),
            const SizedBox(height: 8),

            _FinanceCard(
              title: 'General Ledger & CoA',
              description: 'Double-entry ledger, accounts & accounting periods',
              icon: Icons.menu_book,
              statusText: 'CAP_POSTING Locked',
              statusColor: Colors.amber,
              hasAccess: hasLedgerRead,
            ),
            _FinanceCard(
              title: 'Capital Allocation & Treasury',
              description: 'Capex/Opex requests, liquidity and positions',
              icon: Icons.monetization_on,
              statusText: 'Governed Pipeline',
              statusColor: Colors.green,
              hasAccess: hasCapitalRead && hasTreasuryRead,
            ),
            _FinanceCard(
              title: 'Waterfall Engine',
              description: 'Deterministic tiered cashflow distributions',
              icon: Icons.waterfall_chart,
              statusText: 'Simulation Ready',
              statusColor: Colors.blue,
              hasAccess: hasWaterfallRead,
            ),
            _FinanceCard(
              title: 'Tax Strategy Intelligence',
              description: 'Statutory basis & jurisdiction-gated assessments',
              icon: Icons.policy,
              statusText: 'Advisory Intelligence',
              statusColor: Colors.purple,
              hasAccess: hasTaxRead,
            ),
            _FinanceCard(
              title: 'Bank & Treasury Reconciliation',
              description: 'Subledger to GL reconciliation (0 silent plugs)',
              icon: Icons.fact_check,
              statusText: 'DATA_NOT_AVAILABLE (Honest)',
              statusColor: Colors.teal,
              hasAccess: hasTreasuryRead && hasLedgerRead,
            ),

            const SizedBox(height: 16),

            // Security Footer
            const Center(
              child: Text(
                'BEYU OS · Finance OS Sector\n'
                'All financial transactions resolve through immutable, audited double-entry rails.\n'
                'Mobile client cannot manufacture authority or bypass RLS.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.white38,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FinanceCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final String statusText;
  final Color statusColor;
  final bool hasAccess;

  const _FinanceCard({
    required this.title,
    required this.description,
    required this.icon,
    required this.statusText,
    required this.statusColor,
    required this.hasAccess,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(icon, color: hasAccess ? const Color(0xFFD4AF37) : Colors.grey, size: 28),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.between,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: hasAccess ? Colors.white : Colors.white38,
                        ),
                      ),
                      if (hasAccess)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.parseBorder(Border.all(color: statusColor.withOpacity(0.4))),
                          ),
                          child: Text(
                            statusText,
                            style: TextStyle(fontSize: 9, color: statusColor, fontWeight: FontWeight.bold),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: Colors.white60,
                    ),
                  ),
                ],
              ),
            ),
            if (!hasAccess)
              const Icon(
                Icons.lock_outline,
                color: Colors.white38,
                size: 18,
              ),
          ],
        ),
      ),
    );
  }
}
