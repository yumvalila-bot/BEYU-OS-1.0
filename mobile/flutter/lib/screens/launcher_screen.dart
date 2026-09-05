/// BEYU OS Mobile — Launcher Screen
/// 
/// Shows all authorized OSs for the user.
/// Consumes server-side authorization context.
/// Only shows OSs the user is actually authorized for.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/router_provider.dart';
import '../models/authorization_models.dart';

class LauncherScreen extends StatelessWidget {
  const LauncherScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final router = context.watch<RouterProvider>();
    final authorizedOSs = auth.authorizedOSs;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Select Operating System'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => auth.logout(),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // User info
            Container(
              padding: const EdgeInsets.all(16),
              color: Colors.white.withOpacity(0.03),
              child: Column(
                children: [
                  Text(
                    'Welcome, ${auth.session?.displayName ?? "User"}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${auth.session?.tenantCode ?? "Tenant"} · ${auth.session?.email ?? ""}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.white60,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            
            // OS grid
            Expanded(
              child: GridView.count(
                padding: const EdgeInsets.all(24),
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                children: authorizedOSs.map((os) {
                  return _OSCard(
                    os: os,
                    onTap: () => router.enterOS(os.parsedCode),
                  );
                }).toList(),
              ),
            ),

            // Footer
            Container(
              padding: const EdgeInsets.all(16),
              child: const Text(
                'Authorization resolved from BEYU OS control plane',
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

/// OS card in the launcher
class _OSCard extends StatelessWidget {
  final AuthorizedOS os;
  final VoidCallback onTap;

  const _OSCard({required this.os, required this.onTap});

  IconData _getIcon() {
    switch (os.parsedCode) {
      case OSCode.beyu:
        return Icons.shield_outlined;
      case OSCode.health:
        return Icons.local_hospital_outlined;
      case OSCode.agriculture:
        return Icons.agriculture_outlined;
      case OSCode.unknown:
        return Icons.grid_view;
    }
  }

  Color _getColor() {
    switch (os.parsedCode) {
      case OSCode.beyu:
        return const Color(0xFFD4AF37);
      case OSCode.health:
        return Colors.blue;
      case OSCode.agriculture:
        return Colors.green;
      case OSCode.unknown:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _getColor();

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                _getIcon(),
                size: 48,
                color: color,
              ),
              const SizedBox(height: 12),
              Text(
                os.osName,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                os.osCode,
                style: const TextStyle(
                  fontSize: 10,
                  color: Colors.white60,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
