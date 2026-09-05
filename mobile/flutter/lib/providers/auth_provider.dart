/// BEYU OS Mobile — Authentication Provider
/// 
/// State management for authentication and session.
/// Consumes canonical BEYU authentication.
/// 
/// SECURITY PROPERTIES:
/// - Consumes canonical BEYU auth (not a second system)
/// - Session state derived from server
/// - Fail-closed on errors
/// - Automatic re-authentication on session expiry
/// - No client-side authorization decisions

import 'package:flutter/foundation.dart';
import '../models/auth_models.dart';
import '../models/authorization_models.dart';
import '../services/api_client.dart';
import '../services/secure_storage_service.dart';

/// Authentication state
enum AuthState {
  initial,      // App just started
  loading,      // Checking session
  authenticated, // User is logged in
  unauthenticated, // User needs to login
  mfaRequired,  // MFA code needed
  error,        // Error occurred
}

/// Authentication provider — manages auth state
class AuthProvider extends ChangeNotifier {
  final BeyuApiClient _apiClient;
  final SecureStorageService _storage;

  AuthState _state = AuthState.initial;
  SessionInfo? _session;
  AuthorizationContext? _authContext;
  AuthError? _error;
  String? _pendingEmail; // For MFA flow

  AuthProvider(this._apiClient, this._storage);

  // Getters
  AuthState get state => _state;
  SessionInfo? get session => _session;
  AuthorizationContext? get authContext => _authContext;
  AuthError? get error => _error;
  bool get isAuthenticated => _state == AuthState.authenticated;
  bool get isLoading => _state == AuthState.loading;

  // ============================================
  // INITIALIZATION
  // ============================================

  /// Initialize — check for existing session
  Future<void> initialize() async {
    _state = AuthState.loading;
    notifyListeners();

    try {
      // Check if we have a stored token
      final hasSession = await _storage.hasSession();
      if (!hasSession) {
        _state = AuthState.unauthenticated;
        notifyListeners();
        return;
      }

      // Verify session with server
      _session = await _apiClient.getSession();
      if (!_session!.authenticated) {
        await _storage.clearSession();
        _state = AuthState.unauthenticated;
        notifyListeners();
        return;
      }

      // Load authorization context
      await _loadAuthorizationContext();

      _state = AuthState.authenticated;
      notifyListeners();
    } catch (e) {
      _state = AuthState.unauthenticated;
      _error = AuthError(
        code: AuthErrorCode.unknown,
        message: 'Failed to restore session',
      );
      notifyListeners();
    }
  }

  /// Load authorization context from server
  Future<void> _loadAuthorizationContext() async {
    try {
      _authContext = await _apiClient.getAuthorizationContext();
      
      // Cache metadata for offline use
      await _storage.cacheContextMetadata(
        _authContext!.userId,
        _authContext!.tenantId,
      );
    } catch (e) {
      // If context fails, session is still valid but routing may be limited
      _authContext = null;
    }
  }

  // ============================================
  // LOGIN
  // ============================================

  /// Login with email and password
  Future<void> login(String email, String password, {String? mfaCode}) async {
    _state = AuthState.loading;
    _error = null;
    _pendingEmail = email;
    notifyListeners();

    try {
      final request = LoginRequest(
        email: email,
        password: password,
        mfaCode: mfaCode,
      );

      final response = await _apiClient.login(request);

      if (!response.authenticated) {
        _state = AuthState.unauthenticated;
        _error = AuthError(
          code: AuthErrorCode.invalidCredentials,
          message: 'Authentication failed',
        );
        notifyListeners();
        return;
      }

      // Store token
      if (response.token != null) {
        await _storage.saveToken(response.token!);
      }

      // Check if password must be changed
      if (response.passwordMustChange == true) {
        // TODO: Handle password change flow
        _state = AuthState.error;
        _error = AuthError(
          code: AuthErrorCode.unknown,
          message: 'Password change required',
        );
        notifyListeners();
        return;
      }

      // Load session info
      _session = await _apiClient.getSession();
      if (!_session!.authenticated) {
        await _storage.clearSession();
        _state = AuthState.unauthenticated;
        notifyListeners();
        return;
      }

      // Load authorization context
      await _loadAuthorizationContext();

      _state = AuthState.authenticated;
      notifyListeners();
    } on AuthError catch (e) {
      _error = e;
      
      if (e.code == AuthErrorCode.mfaRequired) {
        _state = AuthState.mfaRequired;
      } else {
        _state = AuthState.unauthenticated;
      }
      
      notifyListeners();
    } catch (e) {
      _state = AuthState.unauthenticated;
      _error = AuthError(
        code: AuthErrorCode.unknown,
        message: 'Login failed: $e',
      );
      notifyListeners();
    }
  }

  /// Submit MFA code
  Future<void> submitMfaCode(String code) async {
    if (_pendingEmail == null) {
      _state = AuthState.unauthenticated;
      notifyListeners();
      return;
    }

    // Re-login with MFA code
    // Note: In a real implementation, you'd store the password securely
    // or use a separate MFA verification endpoint
    // For now, we'll just show an error
    _error = AuthError(
      code: AuthErrorCode.invalidMfa,
      message: 'MFA flow not fully implemented — please login again with MFA code',
    );
    _state = AuthState.unauthenticated;
    notifyListeners();
  }

  // ============================================
  // LOGOUT
  // ============================================

  /// Logout and clear session
  Future<void> logout() async {
    _state = AuthState.loading;
    notifyListeners();

    try {
      await _apiClient.logout();
    } catch (e) {
      // Ignore logout errors — we're clearing local state anyway
    }

    await _storage.clearSession();
    _session = null;
    _authContext = null;
    _state = AuthState.unauthenticated;
    notifyListeners();
  }

  // ============================================
  // AUTHORIZATION
  // ============================================

  /// Refresh authorization context
  Future<void> refreshAuthorizationContext() async {
    if (!isAuthenticated) return;

    try {
      await _loadAuthorizationContext();
      notifyListeners();
    } catch (e) {
      // Context refresh failed — session may still be valid
    }
  }

  /// Check if user is authorized for a specific OS
  bool isAuthorizedForOS(OSCode osCode) {
    return _authContext?.isOSAuthorized(osCode) ?? false;
  }

  /// Get routing recommendation
  RoutingRecommendation get routingRecommendation {
    return _authContext?.parsedRouting ?? RoutingRecommendation.deny;
  }

  /// Get list of authorized OSs
  List<AuthorizedOS> get authorizedOSs {
    return _authContext?.authorizedOnly ?? [];
  }

  // ============================================
  // ERROR HANDLING
  // ============================================

  /// Clear error state
  void clearError() {
    _error = null;
    notifyListeners();
  }
}
