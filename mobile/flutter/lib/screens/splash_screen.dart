/// BEYU OS Mobile — Splash Screen
/// 
/// Shown while initializing the app and checking session.

import 'package:flutter/material.dart';
import '../widgets/beyu_os_logo.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            BeyuOsLogo(size: 80),
            SizedBox(height: 24),
            Text(
              'BEYU OS',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Enterprise Control Plane',
              style: TextStyle(
                fontSize: 14,
                color: Colors.white60,
              ),
            ),
            SizedBox(height: 48),
            CircularProgressIndicator(
              color: Color(0xFFD4AF37),
            ),
          ],
        ),
      ),
    );
  }
}
