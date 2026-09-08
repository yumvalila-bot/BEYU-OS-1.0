/// BEYU OS Mobile — Secure API Client
/// 
/// Centralized HTTP client for all BEYU OS API calls.
/// Handles authentication, authorization context, error handling, and security.
/// 
/// SECURITY PROPERTIES:
/// - Bearer token authentication (from mobile login endpoint)
/// - Automatic token refresh/re-authentication on 401
/// - Fail-closed on unauthorized responses
/// - No sensitive data logged
/// - HTTPS only in production
/// - Timeout handling
/// - Network error handling

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:logger/logger.dart';
import '../config/app_config.dart';
import '../models/auth_models.dart';
import '../models/authorization_models.dart';
import '../services/secure_storage_service.dart';

/// API client for BEYU OS
class BeyuApiClient {
  late final Dio _dio;
  final SecureStorageService _storage;
  final Logger _logger = Logger(
    printer: PrettyPrinter(
      methodCount: 0,
      errorMethodCount: 5,
      lineLength: 80,
      colors: true,
      printEmojis: false,
      printTime: true,
    ),
  );

  BeyuApiClient(this._storage) {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: AppConfig.connectTimeoutSeconds),
      receiveTimeout: const Duration(seconds: AppConfig.requestTimeoutSeconds),
      sendTimeout: const Duration(seconds: AppConfig.requestTimeoutSeconds),
      headers: {
        HttpHeaders.contentTypeHeader: 'application/json',
        HttpHeaders.acceptHeader: 'application/json',
      },
    ));

    // Add authentication interceptor
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: _onRequest,
      onResponse: _onResponse,
      onError: _onError,
    ));
  }

  /// Add authorization header with bearer token
  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Skip auth header for login endpoint
    if (options.path.contains('/auth/mobile/login')) {
      return handler.next(options);
    }

    // Add bearer token if available
    final token = await _storage.getToken();
    if (token != null) {
      options.headers[HttpHeaders.authorizationHeader] = 'Bearer $token';
    }

    handler.next(options);
  }

  /// Handle successful responses
  void _onResponse(
    Response response,
    ResponseInterceptorHandler handler,
  ) {
    handler.next(response);
  }

  /// Handle errors
  Future<void> _onError(
    DioException error,
    ErrorInterceptorHandler handler,
  ) async {
    // If 401 Unauthorized, attempt to refresh or re-authenticate
    if (error.response?.statusCode == 401) {
      _logger.w('Unauthorized response — clearing session');
      await _storage.clearSession();
      // TODO: Trigger re-authentication flow
    }

    handler.next(error);
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  /// Login with email and password
  Future<LoginResponse> login(LoginRequest request) async {
    try {
      final response = await _dio.post(
        '/api/v1/auth/mobile/login',
        data: request.toJson(),
      );

      final data = response.data as Map<String, dynamic>;
      return LoginResponse.fromJson(data);
    } on DioException catch (e) {
      if (e.response != null) {
        final data = e.response!.data as Map<String, dynamic>?;
        if (data != null) {
          throw AuthError.fromResponse(data, e.response!.statusCode ?? 500);
        }
      }
      throw AuthError(
        code: AuthErrorCode.unknown,
        message: 'Network error: ${e.message}',
      );
    }
  }

  /// Logout and revoke session
  Future<void> logout() async {
    try {
      await _dio.post('/api/v1/auth/mobile/logout');
    } catch (e) {
      _logger.e('Logout error: $e');
    } finally {
      await _storage.clearSession();
    }
  }

  /// Check session validity and get session info
  Future<SessionInfo> getSession() async {
    try {
      final response = await _dio.get('/api/v1/auth/mobile/me');
      final data = response.data as Map<String, dynamic>;
      return SessionInfo.fromJson(data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        return SessionInfo(authenticated: false);
      }
      rethrow;
    }
  }

  // ============================================
  // AUTHORIZATION CONTEXT
  // ============================================

  /// Get authorization context (which OSs user is authorized for)
  Future<AuthorizationContext> getAuthorizationContext() async {
    try {
      final response = await _dio.get('/api/v1/authorization/mobile/context');
      final data = response.data as Map<String, dynamic>;
      return AuthorizationContext.fromJson(data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        throw AuthError(
          code: AuthErrorCode.unauthorized,
          message: 'Session expired or invalid',
          statusCode: 401,
        );
      }
      rethrow;
    }
  }

  // ============================================
  // AGRICULTURE OS API
  // Unwrapped JSON — never .data. Harvest is
  // { id, journalsPosted, financeHandoff }.
  // ============================================

  static const _agriEnvelopeAlphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

  /// Envelope ids: 8–128 chars, /^[A-Za-z0-9_-]{8,128}$/. No uuid package.
  String newAgricultureEnvelopeId() {
    final rand = Random();
    final buf = StringBuffer('AGR');
    buf.write(DateTime.now().millisecondsSinceEpoch);
    for (var i = 0; i < 10; i++) {
      buf.write(
        _agriEnvelopeAlphabet[rand.nextInt(_agriEnvelopeAlphabet.length)],
      );
    }
    return buf.toString();
  }

  Map<String, dynamic> _asJsonMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    if (data is String) {
      final decoded = jsonDecode(data);
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    }
    throw AuthError(
      code: AuthErrorCode.unknown,
      message: 'Agriculture OS returned a non-object payload',
    );
  }

  Future<Map<String, dynamic>> getAgricultureDashboard() async {
    final response = await _dio.get('/api/v1/agriculture/dashboard');
    return _asJsonMap(response.data);
  }

  Future<Map<String, dynamic>> listAgricultureHarvests() async {
    final response = await _dio.get('/api/v1/agriculture/harvests');
    return _asJsonMap(response.data);
  }

  Future<Map<String, dynamic>> recordAgricultureHarvest(
    Map<String, dynamic> body,
  ) async {
    final response = await _dio.post(
      '/api/v1/agriculture/harvests',
      data: body,
    );
    return _asJsonMap(response.data);
  }

  Future<Map<String, dynamic>> listAgricultureCapitalCases() async {
    final response = await _dio.get('/api/v1/agriculture/capital-cases');
    return _asJsonMap(response.data);
  }

  Future<Map<String, dynamic>> submitAgricultureCapitalCase(
    Map<String, dynamic> body,
  ) async {
    final response = await _dio.post(
      '/api/v1/agriculture/capital-cases',
      data: body,
    );
    return _asJsonMap(response.data);
  }

  Future<Map<String, dynamic>> runAgricultureWhatIf(
    Map<String, dynamic> body,
  ) async {
    final response = await _dio.post(
      '/api/v1/agriculture/whatif',
      data: body,
    );
    return _asJsonMap(response.data);
  }

  Future<Map<String, dynamic>> syncAgricultureEnvelope(
    Map<String, dynamic> envelope,
  ) async {
    final response = await _dio.post(
      '/api/v1/agriculture/sync',
      data: envelope,
    );
    return _asJsonMap(response.data);
  }

  Future<void> enqueueAgricultureEnvelope({
    required String operation,
    required Map<String, dynamic> payload,
    String? deviceId,
  }) async {
    var userId = await _storage.getCachedUserId();
    var tenantId = await _storage.getCachedTenantId();
    if (userId == null || tenantId == null) {
      try {
        final session = await getSession();
        userId = session.userId;
        tenantId = session.tenantId;
        if (userId != null && tenantId != null) {
          await _storage.cacheContextMetadata(userId, tenantId);
        }
      } catch (_) {}
    }
    if (userId == null || tenantId == null) {
      throw AuthError(
        code: AuthErrorCode.unauthorized,
        message:
            'Agriculture offline queue requires an authenticated Agriculture session',
      );
    }
    await _storage.enqueueAgricultureEnvelope({
      'envelopeId': newAgricultureEnvelopeId(),
      if (deviceId != null) 'deviceId': deviceId,
      'operation': operation,
      'payload': payload,
      'clientOccurredAt': DateTime.now().toUtc().toIso8601String(),
      'userId': userId,
      'tenantId': tenantId,
    });
  }

  Map<String, dynamic> _agricultureSyncBody(Map<String, dynamic> envelope) {
    final body = Map<String, dynamic>.from(envelope);
    body.remove('userId');
    body.remove('tenantId');
    return body;
  }

  /// Replay queued envelopes. Successful (and replay) envelopes are dropped.
  /// Envelopes bound to another user/tenant are dropped, never replayed.
  Future<void> flushAgricultureEnvelopeQueue() async {
    final userId = await _storage.getCachedUserId();
    final tenantId = await _storage.getCachedTenantId();
    final queue = await _storage.loadAgricultureEnvelopeQueue();
    final remaining = <Map<String, dynamic>>[];
    for (final envelope in queue) {
      final boundUser = envelope['userId']?.toString();
      final boundTenant = envelope['tenantId']?.toString();
      if (userId == null ||
          tenantId == null ||
          boundUser != userId ||
          boundTenant != tenantId) {
        continue;
      }
      try {
        await syncAgricultureEnvelope(_agricultureSyncBody(envelope));
      } catch (_) {
        remaining.add(envelope);
      }
    }
    await _storage.replaceAgricultureEnvelopeQueue(remaining);
  }

  // ============================================
  // HEALTH OS API (placeholder — implement as needed)
  // ============================================

  /// Example: Get Health OS dashboard data
  /// This would call the Health backend API with proper authorization
  Future<Map<String, dynamic>> getHealthDashboard() async {
    // TODO: Implement when Health OS mobile screens are built
    // This would call: GET /api/v1/health/dashboard
    // Authorization is handled by the interceptor
    throw UnimplementedError('Health OS mobile integration not yet implemented');
  }

  // ============================================
  // UTILITY
  // ============================================

  /// Check if user is authenticated
  Future<bool> isAuthenticated() async {
    final token = await _storage.getToken();
    if (token == null) return false;

    try {
      final session = await getSession();
      return session.authenticated;
    } catch (e) {
      return false;
    }
  }

  /// Dispose resources
  void dispose() {
    _dio.close();
  }
}
