/// BEYU OS Mobile — Foundation OS Screen
///
/// Canonical mobile interface for Foundation OS operations:
/// - Foundation registry (ONE canonical registry, full lifecycle IDEA→ARCHIVE)
/// - Formation pipeline (draft → review → approval → registration → activation)
/// - Structure designer & simulation (advisory, explainable, non-binding)
/// - Governance (meetings, resolutions, conflicts, delegation calendar)
/// - Tax intelligence (rules, profiles, assessments — advisory only)
/// - Compliance & deadlines (obligations, deadline engine, evidence, escalations)
/// - Donors, funds, donations, grants, programs, projects, impact
/// - Operations (procurement, assets, investments) & safeguarding
///
/// SECURITY PROPERTIES:
/// - Tenant and entity isolated
/// - Re-evaluates permissions server-side
/// - Cannot bypass fail-closed capability gates
/// - All mutations are API-only and strictly audited
/// - Legal-assistance boundary: advisory outputs never constitute legal advice

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class FoundationOSScreen extends StatelessWidget {
  const FoundationOSScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final permissions = auth.session?.permissions ?? [];

    final hasRegistryRead = permissions.contains('foundation:registry.read');
    final hasFormationRead = permissions.contains('foundation:formation.read');
    final hasStructureRead = permissions.contains('foundation:structure.read');
    final hasGovernanceRead = permissions.contains('foundation:governance.read');
    final hasTaxRead = permissions.contains('foundation:tax.read');
    final hasComplianceRead = permissions.contains('foundation:compliance.read');
    final hasDonorRead = permissions.contains('foundation:donor.read');
    final hasFundRead = permissions.contains('foundation:fund.read');
    final hasGrantRead = permissions.contains('foundation:grant.read');
    final hasProgramRead = permissions.contains('foundation:program.read');
    final hasProcurementRead = permissions.contains('foundation:procurement.read');
    final hasSafeguardingRead = permissions.contains('foundation:safeguarding.read');

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.account_balance_wallet, color: Color(0xFFD4AF37)),
            SizedBox(width: 8),
            Text('Foundation OS'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Legal-assistance boundary banner
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
                    Icon(Icons.gavel, color: Colors.amber, size: 24),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Advisory boundary enforced',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.amber,
                              fontSize: 13,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Formation, structure, tax and compliance outputs are advisory and require licensed human counsel for filing or action.',
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
                      'Foundation Context',
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
              'Foundation OS Modules',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white70),
            ),
            const SizedBox(height: 8),

            _FoundationCard(
              title: 'Registry & Lifecycle',
              description: 'Canonical foundations, types & lifecycle IDEA→ARCHIVE',
              icon: Icons.how_to_reg,
              statusText: 'Governed',
              statusColor: Colors.green,
              hasAccess: hasRegistryRead,
            ),
            _FoundationCard(
              title: 'Formation Pipeline',
              description: 'Draft → review → approval → registration → activation',
              icon: Icons.rocket_launch,
              statusText: 'Workflow',
              statusColor: Colors.blue,
              hasAccess: hasFormationRead,
            ),
            _FoundationCard(
              title: 'Structures & Simulation',
              description: 'Design versions, what-if simulation (non-binding)',
              icon: Icons.account_tree,
              statusText: 'Advisory',
              statusColor: Colors.teal,
              hasAccess: hasStructureRead,
            ),
            _FoundationCard(
              title: 'Governance',
              description: 'Meetings, resolutions, conflicts, delegation calendar',
              icon: Icons.groups,
              statusText: 'Board-Grade',
              statusColor: Colors.indigo,
              hasAccess: hasGovernanceRead,
            ),
            _FoundationCard(
              title: 'Tax Intelligence',
              description: 'Versioned rules, profiles, assessments — advisory only',
              icon: Icons.policy,
              statusText: 'Advisory',
              statusColor: Colors.purple,
              hasAccess: hasTaxRead,
            ),
            _FoundationCard(
              title: 'Compliance & Deadlines',
              description: 'Obligations, deadline engine, evidence, escalations',
              icon: Icons.fact_check,
              statusText: 'Monitored',
              statusColor: Colors.orange,
              hasAccess: hasComplianceRead,
            ),
            _FoundationCard(
              title: 'Donors & Funds',
              description: 'Donors, pledges, donations, restricted funds',
              icon: Icons.volunteer_activism,
              statusText: 'Stewarded',
              statusColor: Colors.pink,
              hasAccess: hasDonorRead && hasFundRead,
            ),
            _FoundationCard(
              title: 'Grants & Programs',
              description: 'Grant pipeline, programs, projects, impact evidence',
              icon: Icons.emoji_events,
              statusText: 'Outcome-Driven',
              statusColor: Colors.amber,
              hasAccess: hasGrantRead && hasProgramRead,
            ),
            _FoundationCard(
              title: 'Operations',
              description: 'Procurement, assets, policy-bound investments',
              icon: Icons.business_center,
              statusText: 'Controlled',
              statusColor: Colors.cyan,
              hasAccess: hasProcurementRead,
            ),
            _FoundationCard(
              title: 'Safeguarding',
              description: 'Restricted casework — named access, views audited',
              icon: Icons.shield,
              statusText: 'Restricted',
              statusColor: Colors.red,
              hasAccess: hasSafeguardingRead,
            ),

            const SizedBox(height: 16),

            // Security Footer
            const Center(
              child: Text(
                'BEYU OS · Foundation OS Sector\n'
                'One canonical registry. No sub-OS. No silent failure.\n'
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

class _FoundationCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final String statusText;
  final Color statusColor;
  final bool hasAccess;

  const _FoundationCard({
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
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: hasAccess ? Colors.white : Colors.white38,
                          ),
                        ),
                      ),
                      if (hasAccess)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: statusColor.withOpacity(0.4)),
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
