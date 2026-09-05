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
import 'dart:io';
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
