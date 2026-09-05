/// BEYU OS Mobile — BEYU OS Screen
/// 
/// BEYU OS control plane mobile interface.
/// Shows governance, finance, HCM, and other canonical features.
/// All data comes from BEYU API with proper authorization.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class BeyuOSScreen extends StatelessWidget {
  const BeyuOSScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final permissions = auth.session?.permissions ?? [];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Welcome card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Executive Control Centre',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tenant: ${auth.session?.tenantCode ?? "N/A"}',
                    style: const TextStyle(color: Colors.white60),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Clearance: ${auth.session?.clearance ?? "N/A"}',
                    style: const TextStyle(color: Colors.white60),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Module cards
          _ModuleCard(
            title: 'Governance',
            description: 'Resolutions, policies, and decisions',
            icon: Icons.gavel,
            color: Colors.purple,
            hasAccess: permissions.contains('governance:resolution.read'),
          ),
          _ModuleCard(
            title: 'Finance OS',
            description: 'Capital, treasury, waterfall, tax',
            icon: Icons.account_balance,
            color: Colors.green,
            hasAccess: permissions.any((p) => p.startsWith('finance:')),
          ),
          _ModuleCard(
            title: 'HCM',
            description: 'Workforce management',
            icon: Icons.people,
            color: Colors.orange,
            hasAccess: permissions.contains('hcm:employee.read'),
          ),
          _ModuleCard(
            title: 'Risk & Compliance',
            description: 'Risk register and compliance assessments',
            icon: Icons.shield,
            color: Colors.red,
            hasAccess: permissions.any((p) =>
                p.startsWith('risk:') || p.startsWith('compliance:')),
          ),
          _ModuleCard(
            title: 'Noelia AI',
            description: 'Governing AI assistant',
            icon: Icons.psychology,
            color: Colors.blue,
            hasAccess: permissions.contains('ai:noelia.query'),
          ),
          _ModuleCard(
            title: 'Audit',
            description: 'Immutable audit trail',
            icon: Icons.history,
            color: Colors.teal,
            hasAccess: permissions.contains('audit:log.read'),
          ),

          const SizedBox(height: 16),

          // Security notice
          const Center(
            child: Text(
              'All data is tenant-isolated and fully audited.\n'
              'Server-side authorization is authoritative.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 10,
                color: Colors.white38,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Module card with access indicator
class _ModuleCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final bool hasAccess;

  const _ModuleCard({
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
    required this.hasAccess,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: hasAccess ? color : Colors.grey, size: 32),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: hasAccess ? Colors.white : Colors.white38,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 12,
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
                size: 20,
              ),
          ],
        ),
      ),
    );
  }
}
