/// BEYU OS Mobile — OS Shell Screen
/// 
/// Container for a specific operating system.
/// Re-checks authorization before rendering OS content.
/// Fail-closed: if authorization is lost, shows access denied.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/router_provider.dart';
import '../models/authorization_models.dart';
import 'access_denied_screen.dart';
import 'os_screens/beyu_os_screen.dart';
import 'os_screens/health_os_screen.dart';

class OSshellScreen extends StatelessWidget {
  final OSCode osCode;

  const OSshellScreen({super.key, required this.osCode});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final router = context.watch<RouterProvider>();

    // Re-check authorization (fail-closed)
    if (!auth.isAuthorizedForOS(osCode)) {
      return AccessDeniedScreen(
        message: 'Authorization for this operating system has been revoked.',
        onLogout: () => auth.logout(),
      );
    }

    // Get OS info
    final osInfo = auth.authContext?.getAuthorizedOS(osCode);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Icon(_getIcon(), color: _getColor()),
            const SizedBox(width: 8),
            Text(osInfo?.osName ?? osCode.name.toUpperCase()),
          ],
        ),
        actions: [
          // Switch OS button (if multiple OSs authorized)
          if (auth.authorizedOSs.length > 1)
            IconButton(
              icon: const Icon(Icons.grid_view),
              tooltip: 'Switch Operating System',
              onPressed: () => router.returnToLauncher(),
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Authorization',
            onPressed: () => auth.refreshAuthorizationContext(),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => auth.logout(),
          ),
        ],
      ),
      body: _buildOSScreen(),
    );
  }

  Widget _buildOSScreen() {
    switch (osCode) {
      case OSCode.beyu:
        return const BeyuOSScreen();
      case OSCode.health:
        return const HealthOSScreen();
      case OSCode.agriculture:
        return const _FutureOSScreen(osName: 'Agriculture OS');
      case OSCode.unknown:
        return const _FutureOSScreen(osName: 'Unknown OS');
    }
  }

  IconData _getIcon() {
    switch (osCode) {
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
    switch (osCode) {
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
}

/// Placeholder for future OSs
class _FutureOSScreen extends StatelessWidget {
  final String osName;

  const _FutureOSScreen({required this.osName});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.construction,
            size: 80,
            color: Colors.white38,
          ),
          const SizedBox(height: 24),
          Text(
            osName,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'FUTURE / NOT YET INTEGRATED',
            style: TextStyle(
              fontSize: 14,
              color: Colors.white60,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'This operating system has not been implemented yet.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              color: Colors.white38,
            ),
          ),
        ],
      ),
    );
  }
}
