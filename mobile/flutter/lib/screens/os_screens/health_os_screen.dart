/// BEYU OS Mobile — Health OS Screen
/// 
/// Health OS mobile interface.
/// Consumes canonical BEYU identity through federation.
/// All data comes from Health API with proper authorization.
/// 
/// ARCHITECTURE:
/// Flutter → BEYU Auth → GlobalUserID → Authorization → Health API → Health DB/RLS

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class HealthOSScreen extends StatelessWidget {
  const HealthOSScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final healthOS = auth.authContext?.getAuthorizedOS(
      OSCode.health,
    );

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Health OS info card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.local_hospital, color: Colors.blue, size: 32),
                      SizedBox(width: 12),
                      Text(
                        'Health OS',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (healthOS?.sectorUserId != null) ...[
                    Text(
                      'Sector User ID: ${healthOS!.sectorUserId}',
                      style: const TextStyle(
                        fontSize: 10,
                        color: Colors.white60,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(height: 4),
                  ],
                  if (healthOS?.linkedAt != null)
                    Text(
                      'Linked: ${DateTime.parse(healthOS!.linkedAt!).toIso8601String().split('T')[0]}',
                      style: const TextStyle(
                        fontSize: 10,
                        color: Colors.white60,
                      ),
                    ),
                  const SizedBox(height: 8),
                  const Text(
                    'Federated through canonical BEYU identity',
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

          // Health modules
          _HealthModuleCard(
            title: 'Clinical Operations',
            description: 'EMR, prescriptions, radiology, lab',
            icon: Icons.medical_services,
            permission: 'health:clinical.read',
          ),
          _HealthModuleCard(
            title: 'Patient Portal',
            description: 'Patient records and appointments',
            icon: Icons.person,
            permission: 'health:patient.read',
          ),
          _HealthModuleCard(
            title: 'Pharmacy',
            description: 'Medication management',
            icon: Icons.local_pharmacy,
            permission: 'health:pharmacy.read',
          ),
          _HealthModuleCard(
            title: 'Governance',
            description: 'Healthcare governance and compliance',
            icon: Icons.admin_panel_settings,
            permission: 'health:governance.read',
          ),

          const SizedBox(height: 16),

          // Architecture note
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blue.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.blue.withOpacity(0.3)),
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
                  'Health OS is a sector operating system that consumes '
                  'your canonical BEYU identity through federation. '
                  'Your Health sector credentials are linked to your '
                  'canonical BEYU GlobalUserID, ensuring unified identity '
                  'across all operating systems.',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Security notice
          const Center(
            child: Text(
              'All health data is tenant-isolated, RLS-enforced, and fully audited.\n'
              'Canonical identity federation ensures unified authorization.',
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

/// Health module card
class _HealthModuleCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final String permission;

  const _HealthModuleCard({
    required this.title,
    required this.description,
    required this.icon,
    required this.permission,
  });

  @override
  Widget build(BuildContext context) {
    // Note: In a real implementation, you'd check if the user has this permission
    // For now, we'll show all modules but mark them as requiring authorization
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: Colors.blue, size: 32),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
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
            const Icon(
              Icons.arrow_forward_ios,
              color: Colors.white38,
              size: 16,
            ),
          ],
        ),
      ),
    );
  }
}

// Need to import OSCode
import '../../models/authorization_models.dart';
