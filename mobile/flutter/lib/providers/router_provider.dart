/// BEYU OS Mobile — Smart Router Provider
/// 
/// Implements the same smart routing logic as BEYU Web:
/// - 0 authorized OSs → Access Denied
/// - 1 authorized OS → Direct routing to that OS
/// - Multiple authorized OSs → Launcher
/// 
/// SECURITY PROPERTIES:
/// - Routing decisions based on server-side authorization
/// - No client-side OS entitlement decisions
/// - Re-evaluates authorization on OS switching
/// - URL/deep-link never grants authorization
/// - Fail-closed on authorization errors

import 'package:flutter/foundation.dart';
import '../models/authorization_models.dart';
import 'auth_provider.dart';

/// Router state
enum RouterState {
  initial,
  loading,
  denied,        // No authorized OSs
  direct,        // Single OS — route directly
  launcher,      // Multiple OSs — show launcher
  inOS,          // Currently in an OS
}

/// Destination within an OS
enum OSDestination {
  home,
  dashboard,
  patients,      // Health OS
  clinical,      // Health OS
  // Add more as needed
}

/// Smart router provider
class RouterProvider extends ChangeNotifier {
  final AuthProvider _authProvider;

  RouterState _state = RouterState.initial;
  OSCode? _currentOS;
  OSDestination _currentDestination = OSDestination.home;
  String? _deeplink;

  RouterProvider(this._authProvider) {
    // Listen to auth changes
    _authProvider.addListener(_onAuthChanged);
  }

  // Getters
  RouterState get state => _state;
  OSCode? get currentOS => _currentOS;
  OSDestination get currentDestination => _currentDestination;
  String? get deeplink => _deeplink;
  bool get isInOS => _state == RouterState.inOS;

  /// Handle auth state changes
  void _onAuthChanged() {
    if (_authProvider.state == AuthState.authenticated) {
      _determineRouting();
    } else if (_authProvider.state == AuthState.unauthenticated) {
      _state = RouterState.initial;
      _currentOS = null;
      notifyListeners();
    }
  }

  /// Determine routing based on authorization context
  void _determineRouting() {
    final routing = _authProvider.routingRecommendation;

    switch (routing) {
      case RoutingRecommendation.deny:
        _state = RouterState.denied;
        _currentOS = null;
        break;

      case RoutingRecommendation.direct:
        _state = RouterState.direct;
        // Route to the single authorized OS
        final osList = _authProvider.authorizedOSs;
        if (osList.isNotEmpty) {
          _currentOS = osList.first.parsedCode;
        }
        break;

      case RoutingRecommendation.launcher:
        _state = RouterState.launcher;
        _currentOS = null;
        break;

      case RoutingRecommendation.unknown:
        _state = RouterState.denied;
        _currentOS = null;
        break;
    }

    notifyListeners();
  }

  // ============================================
  // OS NAVIGATION
  // ============================================

  /// Enter a specific OS (from launcher or deep link)
  /// SECURITY: Re-checks authorization before entering OS
  bool enterOS(OSCode osCode) {
    // Verify authorization
    if (!_authProvider.isAuthorizedForOS(osCode)) {
      // Not authorized — fail closed
      _state = RouterState.denied;
      _currentOS = null;
      notifyListeners();
      return false;
    }

    _state = RouterState.inOS;
    _currentOS = osCode;
    _currentDestination = OSDestination.home;
    notifyListeners();
    return true;
  }

  /// Switch to a different OS
  /// SECURITY: Re-evaluates authorization on switch
  bool switchOS(OSCode osCode) {
    // Re-check authorization
    if (!_authProvider.isAuthorizedForOS(osCode)) {
      // Not authorized — fail closed
      _state = RouterState.denied;
      _currentOS = null;
      notifyListeners();
      return false;
    }

    _currentOS = osCode;
    _currentDestination = OSDestination.home;
    notifyListeners();
    return true;
  }

  /// Navigate within current OS
  void navigateTo(OSDestination destination) {
    if (_state != RouterState.inOS || _currentOS == null) {
      return;
    }

    _currentDestination = destination;
    notifyListeners();
  }

  /// Return to launcher
  void returnToLauncher() {
    _state = RouterState.launcher;
    _currentOS = null;
    _currentDestination = OSDestination.home;
    notifyListeners();
  }

  /// Handle deep link
  /// SECURITY: Deep link never grants authorization
  void handleDeepLink(String uri) {
    _deeplink = uri;

    // Parse URI and determine destination
    // Example: beyu://health/patients/123
    final parsed = Uri.tryParse(uri);
    if (parsed == null) return;

    final pathSegments = parsed.pathSegments;
    if (pathSegments.isEmpty) return;

    final osName = pathSegments[0].toUpperCase();
    
    // Map OS name to OSCode
    OSCode? targetOS;
    switch (osName) {
      case 'BEYU':
        targetOS = OSCode.beyu;
        break;
      case 'HEALTH':
        targetOS = OSCode.health;
        break;
      // Agriculture remains FUTURE
    }

    if (targetOS == null) {
      // Unknown OS — deny
      _state = RouterState.denied;
      notifyListeners();
      return;
    }

    // Check authorization
    if (!_authProvider.isAuthorizedForOS(targetOS)) {
      // Not authorized — deny
      _state = RouterState.denied;
      notifyListeners();
      return;
    }

    // Authorized — navigate
    _state = RouterState.inOS;
    _currentOS = targetOS;
    
    // Parse further path segments for destination
    if (pathSegments.length > 1) {
      final resource = pathSegments[1].toLowerCase();
      switch (resource) {
        case 'patients':
          _currentDestination = OSDestination.patients;
          break;
        case 'clinical':
          _currentDestination = OSDestination.clinical;
          break;
        default:
          _currentDestination = OSDestination.home;
      }
    }

    notifyListeners();
  }

  // ============================================
  // REFRESH
  // ============================================

  /// Refresh authorization and re-determine routing
  Future<void> refresh() async {
    await _authProvider.refreshAuthorizationContext();
    _determineRouting();
  }

  @override
  void dispose() {
    _authProvider.removeListener(_onAuthChanged);
    super.dispose();
  }
}
