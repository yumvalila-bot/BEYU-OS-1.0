/// BEYU OS Mobile — Authorization Context Models
/// 
/// Models for authorization context responses.
/// Consumes the canonical BEYU authorization context API.
/// Flutter is NOT the authorization authority — server is.

import 'package:json_annotation/json_annotation.dart';

part 'authorization_models.g.dart';

/// Operating System identifier
enum OSCode {
  beyu,
  health,
  agriculture, // Future — NOT YET INTEGRATED
  unknown,
}

/// Authorized OS information
@JsonSerializable()
class AuthorizedOS {
  final String osCode;
  final String osName;
  final bool authorized;
  final String? tenantId;
  final String? tenantCode;
  final List<String>? entityScope;
  final List<String>? roles;
  final List<String>? permissions;
  final String? sectorUserId;
  final String? linkedAt;

  AuthorizedOS({
    required this.osCode,
    required this.osName,
    required this.authorized,
    this.tenantId,
    this.tenantCode,
    this.entityScope,
    this.roles,
    this.permissions,
    this.sectorUserId,
    this.linkedAt,
  });

  factory AuthorizedOS.fromJson(Map<String, dynamic> json) =>
      _$AuthorizedOSFromJson(json);
  
  Map<String, dynamic> toJson() => _$AuthorizedOSToJson(this);

  /// Parse OS code from string
  OSCode get parsedCode {
    switch (osCode.toUpperCase()) {
      case 'BEYU':
        return OSCode.beyu;
      case 'HEALTH':
        return OSCode.health;
      case 'AGRICULTURE':
        return OSCode.agriculture;
      default:
        return OSCode.unknown;
    }
  }
}

/// Routing recommendation from server
enum RoutingRecommendation {
  direct,   // Single OS — route directly
  launcher, // Multiple OSs — show launcher
  deny,     // No authorized OSs — deny access
  unknown,
}

/// Complete authorization context
@JsonSerializable()
class AuthorizationContext {
  final String userId;
  final String partyId;
  final String email;
  final String displayName;
  final String tenantId;
  final String tenantCode;
  final String tenantType;
  final List<String> roles;
  final List<String> permissions;
  final List<String> entityScope;
  final bool mfaSatisfied;
  final String sessionId;
  final int riskScore;
  final String expiresAt;
  final List<AuthorizedOS> authorizedOSs;
  final int authorizedCount;
  final String routingRecommendation;
  final String resolvedAt;

  AuthorizationContext({
    required this.userId,
    required this.partyId,
    required this.email,
    required this.displayName,
    required this.tenantId,
    required this.tenantCode,
    required this.tenantType,
    required this.roles,
    required this.permissions,
    required this.entityScope,
    required this.mfaSatisfied,
    required this.sessionId,
    required this.riskScore,
    required this.expiresAt,
    required this.authorizedOSs,
    required this.authorizedCount,
    required this.routingRecommendation,
    required this.resolvedAt,
  });

  factory AuthorizationContext.fromJson(Map<String, dynamic> json) =>
      _$AuthorizationContextFromJson(json);
  
  Map<String, dynamic> toJson() => _$AuthorizationContextToJson(this);

  /// Parse routing recommendation
  RoutingRecommendation get parsedRouting {
    switch (routingRecommendation.toUpperCase()) {
      case 'DIRECT':
        return RoutingRecommendation.direct;
      case 'LAUNCHER':
        return RoutingRecommendation.launcher;
      case 'DENY':
        return RoutingRecommendation.deny;
      default:
        return RoutingRecommendation.unknown;
    }
  }

  /// Get authorized OS list
  List<AuthorizedOS> get authorizedOnly =>
      authorizedOSs.where((os) => os.authorized).toList();

  /// Check if a specific OS is authorized
  bool isOSAuthorized(OSCode code) {
    return authorizedOSs.any((os) =>
        os.authorized && os.parsedCode == code);
  }

  /// Get a specific authorized OS
  AuthorizedOS? getAuthorizedOS(OSCode code) {
    try {
      return authorizedOSs.firstWhere(
        (os) => os.authorized && os.parsedCode == code,
      );
    } catch (_) {
      return null;
    }
  }
}
