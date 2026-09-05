/// BEYU OS Mobile — Main Application
/// 
/// Entry point for the Flutter mobile client.
/// Consumes canonical BEYU authentication and authorization.
/// 
/// ARCHITECTURE:
/// - Single canonical identity (GlobalUserID)
/// - Single canonical authorization context
/// - Smart OS routing (same as BEYU Web)
/// - Secure session management
/// - Fail-closed security model

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/router_provider.dart';
import 'services/api_client.dart';
import 'services/secure_storage_service.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/mfa_screen.dart';
import 'screens/access_denied_screen.dart';
import 'screens/launcher_screen.dart';
import 'screens/os_shell_screen.dart';
import 'config/app_config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BeyuOSApp());
}

/// BEYU OS Mobile Application
class BeyuOSApp extends StatelessWidget {
  const BeyuOSApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Initialize services
    final storage = SecureStorageService();
    final apiClient = BeyuApiClient(storage);

    return MultiProvider(
      providers: [
        // Authentication provider
        ChangeNotifierProvider(
          create: (_) => AuthProvider(apiClient, storage)..initialize(),
        ),
        // Router provider (depends on auth)
        ChangeNotifierProxyProvider<AuthProvider, RouterProvider>(
          create: (_) => RouterProvider,
          update: (_, auth, __) => RouterProvider(auth),
        ),
      ],
      child: MaterialApp(
        title: AppConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: _buildTheme(),
        home: const AppRouter(),
      ),
    );
  }

  /// BEYU OS theme — enterprise, professional
  ThemeData _buildTheme() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFD4AF37), // BEYU Gold
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xFF0B1D3A), // BEYU Navy
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF0B1D3A),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      cardTheme: CardTheme(
        color: Colors.white.withOpacity(0.06),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFD4AF37), width: 0.5),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFD4AF37),
          foregroundColor: const Color(0xFF0B1D3A),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white.withOpacity(0.06),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Colors.white24),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Colors.white24),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0xFFD4AF37), width: 2),
        ),
      ),
    );
  }
}

/// App router — determines which screen to show based on auth/router state
class AppRouter extends StatelessWidget {
  const AppRouter({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final router = context.watch<RouterProvider>();

    // Show splash while initializing
    if (auth.state == AuthState.initial || auth.state == AuthState.loading) {
      return const SplashScreen();
    }

    // Show login if unauthenticated
    if (auth.state == AuthState.unauthenticated) {
      return const LoginScreen();
    }

    // Show MFA screen if MFA required
    if (auth.state == AuthState.mfaRequired) {
      return const MfaScreen();
    }

    // Show error if auth error
    if (auth.state == AuthState.error) {
      return AccessDeniedScreen(
        message: auth.error?.message ?? 'Authentication error',
        onLogout: () => auth.logout(),
      );
    }

    // Authenticated — route based on authorization context
    switch (router.state) {
      case RouterState.initial:
      case RouterState.loading:
        return const SplashScreen();

      case RouterState.denied:
        return AccessDeniedScreen(
          message: 'You are not authorized to access any operating system.',
          onLogout: () => auth.logout(),
        );

      case RouterState.direct:
        // Single OS — enter directly
        if (router.currentOS != null) {
          router.enterOS(router.currentOS!);
        }
        return const SplashScreen();

      case RouterState.launcher:
        return const LauncherScreen();

      case RouterState.inOS:
        return OSshellScreen(osCode: router.currentOS!);
    }
  }
}
