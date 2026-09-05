/// BEYU OS Mobile — Access Denied Screen
/// 
/// Shown when user has no authorized OSs or authorization fails.
/// Fail-closed security model.

import 'package:flutter/material.dart';

class AccessDeniedScreen extends StatelessWidget {
  final String message;
  final VoidCallback onLogout;

  const AccessDeniedScreen({
    super.key,
    required this.message,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.lock_outline,
                  size: 80,
                  color: Colors.red,
                ),
                const SizedBox(height: 24),
                const Text(
                  'Access Denied',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Colors.white60,
                  ),
                ),
                const SizedBox(height: 48),
                ElevatedButton(
                  onPressed: onLogout,
                  child: const Text('Sign Out'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
