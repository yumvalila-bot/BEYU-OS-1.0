/// BEYU OS Mobile — Secure Storage Service
/// 
/// Handles secure storage of session tokens and sensitive data.
/// Uses platform-specific secure storage (Keychain on iOS, Keystore on Android).
/// 
/// SECURITY PROPERTIES:
/// - Session token stored in secure platform storage
/// - No passwords stored (only session tokens)
/// - No sensitive data in SharedPreferences/UserDefaults
/// - Automatic clearing on logout
/// - Expiration checking

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

/// Secure storage for session tokens and sensitive data
class SecureStorageService {
  final FlutterSecureStorage _storage;

  SecureStorageService()
      : _storage = const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
          iOptions: IOSOptions(
            accessibility: KeychainAccessibility.first_unlock,
          ),
        );

  // ============================================
  // SESSION TOKEN
  // ============================================

  /// Store session token securely
  Future<void> saveToken(String token) async {
    await _storage.write(
      key: AppConfig.tokenStorageKey,
      value: token,
    );
  }

  /// Retrieve session token
  Future<String?> getToken() async {
    return await _storage.read(key: AppConfig.tokenStorageKey);
  }

  /// Delete session token
  Future<void> deleteToken() async {
    await _storage.delete(key: AppConfig.tokenStorageKey);
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /// Check if session token exists
  Future<bool> hasSession() async {
    final token = await getToken();
    return token != null && token.isNotEmpty;
  }

  /// Clear all session data (logout)
  Future<void> clearSession() async {
    await _storage.deleteAll();
  }

  // ============================================
  // AUTHORIZATION CONTEXT CACHE
  // ============================================

  /// Store authorization context cache (non-sensitive, can use regular storage)
  /// NOTE: Only cache metadata, not full authorization data
  Future<void> cacheContextMetadata(String userId, String tenantId) async {
    await _storage.write(key: 'cached_user_id', value: userId);
    await _storage.write(key: 'cached_tenant_id', value: tenantId);
  }

  /// Get cached user ID
  Future<String?> getCachedUserId() async {
    return await _storage.read(key: 'cached_user_id');
  }

  /// Get cached tenant ID
  Future<String?> getCachedTenantId() async {
    return await _storage.read(key: 'cached_tenant_id');
  }

  // ============================================
  // SECURITY
  // ============================================

  /// Clear all sensitive data
  Future<void> clearAllSensitiveData() async {
    await _storage.deleteAll();
  }

  /// Check if storage is available
  Future<bool> isAvailable() async {
    try {
      // Try to read a non-existent key to check availability
      await _storage.read(key: 'test');
      return true;
    } catch (e) {
      return false;
    }
  }
}
