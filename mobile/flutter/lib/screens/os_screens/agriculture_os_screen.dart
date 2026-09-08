/// BEYU OS Mobile — Agriculture OS Screen
///
/// Agriculture OS is a sector operating system inside the BEYU kernel.
/// It consumes canonical BEYU identity, authorization, audit and events.
/// It does NOT federate a second GlobalUserID and does NOT post journals.
///
/// ARCHITECTURE:
/// Flutter → BEYU Auth → GlobalUserID → Authorization → Agriculture API → RLS
/// Finance OS remains the only journal writer. CAP_POSTING stays LOCKED.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class AgricultureOSScreen extends StatelessWidget {
  const AgricultureOSScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final permissions = auth.session?.permissions ?? [];
    final hasRead = permissions.contains('agriculture:data.read');
    final hasManage = permissions.contains('agriculture:data.manage');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
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
                          'Harvests emit HARVEST_RECORDED only. Finance OS is the only journal writer.',
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

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.agriculture, color: Colors.green, size: 32),
                      SizedBox(width: 12),
                      Text(
                        'Agriculture OS',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Tenant: ${auth.session?.tenantCode ?? "N/A"}',
                    style: const TextStyle(fontSize: 12, color: Colors.white60),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Clearance: ${auth.session?.clearance ?? "N/A"}',
                    style: const TextStyle(fontSize: 12, color: Colors.white60),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Sector OS under BEYU OS — Tanzania-first operational truth. '
                    'Identity, HCM, journals and capital execution remain with BEYU / Finance OS.',
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.white38,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          _AgricultureModuleCard(
            title: 'Farms & land',
            description: 'Production units, fields, parcels and tenure',
            icon: Icons.landscape,
            permission: 'agriculture:data.read',
            hasAccess: hasRead,
          ),
          _AgricultureModuleCard(
            title: 'Crop cycles & harvests',
            description: 'Planting through HARVEST_RECORDED (never a journal)',
            icon: Icons.grass,
            permission: 'agriculture:data.manage',
            hasAccess: hasManage,
          ),
          _AgricultureModuleCard(
            title: 'Livestock',
            description: 'Herds, head-count events, veterinary records',
            icon: Icons.pets,
            permission: 'agriculture:data.read',
            hasAccess: hasRead,
          ),
          _AgricultureModuleCard(
            title: 'Work orders',
            description: 'Field execution and task assignments',
            icon: Icons.assignment,
            permission: 'agriculture:data.read',
            hasAccess: hasRead,
          ),
          _AgricultureModuleCard(
            title: 'Hazard register',
            description: 'Operational hazards — not the enterprise risk register',
            icon: Icons.warning_amber,
            permission: 'agriculture:data.read',
            hasAccess: hasRead,
          ),
          _AgricultureModuleCard(
            title: 'Capital cases',
            description: 'Handoff pending Finance OS. CAP_POSTING remains LOCKED',
            icon: Icons.account_balance_wallet,
            permission: 'agriculture:data.read',
            hasAccess: hasRead,
          ),
          _AgricultureModuleCard(
            title: 'Offline sync',
            description: 'Idempotent envelopes queued in secure storage',
            icon: Icons.sync,
            permission: 'agriculture:data.manage',
            hasAccess: hasManage,
          ),

          const SizedBox(height: 16),

          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.green.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.green.withOpacity(0.3)),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Architecture Note',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Agriculture OS is a sector operating system that consumes '
                  'your canonical BEYU identity. It is not a federated launcher OS '
                  'and it does not own GlobalUserID, HCM, journals or Noelia. '
                  'Offline harvest envelopes replay idempotently via /api/v1/agriculture/sync.',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          const Center(
            child: Text(
              'All agriculture data is tenant-isolated, RLS-enforced, and fully audited.\n'
              'What-if runs are SIMULATION only. They are never financial truth.',
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

class _AgricultureModuleCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final String permission;
  final bool hasAccess;

  const _AgricultureModuleCard({
    required this.title,
    required this.description,
    required this.icon,
    required this.permission,
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
            Icon(icon, color: hasAccess ? Colors.green : Colors.grey, size: 32),
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
                  const SizedBox(height: 4),
                  Text(
                    'Requires: $permission',
                    style: const TextStyle(
                      fontSize: 9,
                      color: Colors.white38,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              hasAccess ? Icons.arrow_forward_ios : Icons.lock_outline,
              color: Colors.white38,
              size: 16,
            ),
          ],
        ),
      ),
    );
  }
}
