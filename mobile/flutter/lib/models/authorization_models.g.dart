// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'authorization_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AuthorizedOS _$AuthorizedOSFromJson(Map<String, dynamic> json) => AuthorizedOS(
      osCode: json['osCode'] as String,
      osName: json['osName'] as String,
      authorized: json['authorized'] as bool,
      tenantId: json['tenantId'] as String?,
      tenantCode: json['tenantCode'] as String?,
      entityScope: (json['entityScope'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      roles: (json['roles'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      sectorUserId: json['sectorUserId'] as String?,
      linkedAt: json['linkedAt'] as String?,
    );

Map<String, dynamic> _$AuthorizedOSToJson(AuthorizedOS instance) =>
    <String, dynamic>{
      'osCode': instance.osCode,
      'osName': instance.osName,
      'authorized': instance.authorized,
      'tenantId': instance.tenantId,
      'tenantCode': instance.tenantCode,
      'entityScope': instance.entityScope,
      'roles': instance.roles,
      'permissions': instance.permissions,
      'sectorUserId': instance.sectorUserId,
      'linkedAt': instance.linkedAt,
    };

AuthorizationContext _$AuthorizationContextFromJson(
        Map<String, dynamic> json) =>
    AuthorizationContext(
      userId: json['userId'] as String,
      partyId: json['partyId'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String,
      tenantId: json['tenantId'] as String,
      tenantCode: json['tenantCode'] as String,
      tenantType: json['tenantType'] as String,
      roles: (json['roles'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      permissions: (json['permissions'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      entityScope: (json['entityScope'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      mfaSatisfied: json['mfaSatisfied'] as bool,
      sessionId: json['sessionId'] as String,
      riskScore: json['riskScore'] as int,
      expiresAt: json['expiresAt'] as String,
      authorizedOSs: (json['authorizedOSs'] as List<dynamic>)
          .map((e) => AuthorizedOS.fromJson(e as Map<String, dynamic>))
          .toList(),
      authorizedCount: json['authorizedCount'] as int,
      routingRecommendation: json['routingRecommendation'] as String,
      resolvedAt: json['resolvedAt'] as String,
    );

Map<String, dynamic> _$AuthorizationContextToJson(
        AuthorizationContext instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'partyId': instance.partyId,
      'email': instance.email,
      'displayName': instance.displayName,
      'tenantId': instance.tenantId,
      'tenantCode': instance.tenantCode,
      'tenantType': instance.tenantType,
      'roles': instance.roles,
      'permissions': instance.permissions,
      'entityScope': instance.entityScope,
      'mfaSatisfied': instance.mfaSatisfied,
      'sessionId': instance.sessionId,
      'riskScore': instance.riskScore,
      'expiresAt': instance.expiresAt,
      'authorizedOSs': instance.authorizedOSs,
      'authorizedCount': instance.authorizedCount,
      'routingRecommendation': instance.routingRecommendation,
      'resolvedAt': instance.resolvedAt,
    };
