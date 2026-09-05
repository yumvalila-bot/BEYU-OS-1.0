/// BEYU OS Mobile — Authentication Models
/// 
/// Models for authentication requests and responses.
/// Consumes the canonical BEYU authentication API.

import 'package:json_annotation/json_annotation.dart';

part 'auth_models.g.dart';

/// Login request
@JsonSerializable()
class LoginRequest {
  final String email;
  final String password;
  final String? mfaCode;

  LoginRequest({
    required this.email,
    required this.password,
    this.mfaCode,
  });

  factory LoginRequest.fromJson(Map<String, dynamic> json) =>
      _$LoginRequestFromJson(json);
  
  Map<String, dynamic> toJson() => _$LoginRequestToJson(this);
}

/// Login response
@JsonSerializable()
class LoginResponse {
  final bool authenticated;
  final String? token;
  final String? sessionId;
  final String? expiresAt;
  final bool? mfaSatisfied;
  final bool? passwordMustChange;

  LoginResponse({
    required this.authenticated,
    this.token,
    this.sessionId,
    this.expiresAt,
    this.mfaSatisfied,
    this.passwordMustChange,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) =>
      _$LoginResponseFromJson(json);
  
  Map<String, dynamic> toJson() => _$LoginResponseToJson(this);
}

/// Session info (from /me endpoint)
@JsonSerializable()
class SessionInfo {
  final bool authenticated;
  final String? userId;
  final String? partyId;
  final String? email;
  final String? displayName;
  final String? tenantId;
  final String? tenantCode;
  final String? tenantType;
  final List<String>? roles;
  final List<String>? permissions;
  final String? clearance;
  final List<String>? entityScope;
  final bool? mfaSatisfied;
  final String? sessionId;
  final int? riskScore;
  final String? expiresAt;

  SessionInfo({
    required this.authenticated,
    this.userId,
    this.partyId,
    this.email,
    this.displayName,
    this.tenantId,
    this.tenantCode,
    this.tenantType,
    this.roles,
    this.permissions,
    this.clearance,
    this.entityScope,
    this.mfaSatisfied,
    this.sessionId,
    this.riskScore,
    this.expiresAt,
  });

  factory SessionInfo.fromJson(Map<String, dynamic> json) =>
      _$SessionInfoFromJson(json);
  
  Map<String, dynamic> toJson() => _$SessionInfoToJson(this);
}

/// Authentication error codes
enum AuthErrorCode {
  invalidCredentials,
  accountLocked,
  mfaRequired,
  mfaLocked,
  invalidMfa,
  rateLimited,
  validationFailed,
  unauthorized,
  unknown,
}

/// Authentication error
class AuthError implements Exception {
  final AuthErrorCode code;
  final String message;
  final int? statusCode;

  AuthError({
    required this.code,
    required this.message,
    this.statusCode,
  });

  @override
  String toString() => 'AuthError($code): $message';

  factory AuthError.fromResponse(Map<String, dynamic> json, int statusCode) {
    final error = json['error'] as String? ?? 'UNKNOWN_ERROR';
    final message = json['message'] as String? ?? 'Authentication failed';

    AuthErrorCode code;
    switch (error) {
      case 'INVALID_CREDENTIALS':
        code = AuthErrorCode.invalidCredentials;
        break;
      case 'ACCOUNT_LOCKED':
        code = AuthErrorCode.accountLocked;
        break;
      case 'MFA_REQUIRED':
        code = AuthErrorCode.mfaRequired;
        break;
      case 'MFA_LOCKED':
        code = AuthErrorCode.mfaLocked;
        break;
      case 'INVALID_MFA':
        code = AuthErrorCode.invalidMfa;
        break;
      case 'RATE_LIMITED':
        code = AuthErrorCode.rateLimited;
        break;
      case 'VALIDATION_FAILED':
        code = AuthErrorCode.validationFailed;
        break;
      case 'UNAUTHORIZED':
        code = AuthErrorCode.unauthorized;
        break;
      default:
        code = AuthErrorCode.unknown;
    }

    return AuthError(
      code: code,
      message: message,
      statusCode: statusCode,
    );
  }
}
