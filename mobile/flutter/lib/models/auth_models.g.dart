// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LoginRequest _$LoginRequestFromJson(Map<String, dynamic> json) => LoginRequest(
      email: json['email'] as String,
      password: json['password'] as String,
      mfaCode: json['mfaCode'] as String?,
    );

Map<String, dynamic> _$LoginRequestToJson(LoginRequest instance) =>
    <String, dynamic>{
      'email': instance.email,
      'password': instance.password,
      'mfaCode': instance.mfaCode,
    };

LoginResponse _$LoginResponseFromJson(Map<String, dynamic> json) =>
    LoginResponse(
      authenticated: json['authenticated'] as bool,
      token: json['token'] as String?,
      sessionId: json['sessionId'] as String?,
      expiresAt: json['expiresAt'] as String?,
      mfaSatisfied: json['mfaSatisfied'] as bool?,
      passwordMustChange: json['passwordMustChange'] as bool?,
    );

Map<String, dynamic> _$LoginResponseToJson(LoginResponse instance) =>
    <String, dynamic>{
      'authenticated': instance.authenticated,
      'token': instance.token,
      'sessionId': instance.sessionId,
      'expiresAt': instance.expiresAt,
      'mfaSatisfied': instance.mfaSatisfied,
      'passwordMustChange': instance.passwordMustChange,
    };

SessionInfo _$SessionInfoFromJson(Map<String, dynamic> json) => SessionInfo(
      authenticated: json['authenticated'] as bool,
      userId: json['userId'] as String?,
      partyId: json['partyId'] as String?,
      email: json['email'] as String?,
      displayName: json['displayName'] as String?,
      tenantId: json['tenantId'] as String?,
      tenantCode: json['tenantCode'] as String?,
      tenantType: json['tenantType'] as String?,
      roles: (json['roles'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      clearance: json['clearance'] as String?,
      entityScope: (json['entityScope'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      mfaSatisfied: json['mfaSatisfied'] as bool?,
      sessionId: json['sessionId'] as String?,
      riskScore: json['riskScore'] as int?,
      expiresAt: json['expiresAt'] as String?,
    );

Map<String, dynamic> _$SessionInfoToJson(SessionInfo instance) =>
    <String, dynamic>{
      'authenticated': instance.authenticated,
      'userId': instance.userId,
      'partyId': instance.partyId,
      'email': instance.email,
      'displayName': instance.displayName,
      'tenantId': instance.tenantId,
      'tenantCode': instance.tenantCode,
      'tenantType': instance.tenantType,
      'roles': instance.roles,
      'permissions': instance.permissions,
      'clearance': instance.clearance,
      'entityScope': instance.entityScope,
      'mfaSatisfied': instance.mfaSatisfied,
      'sessionId': instance.sessionId,
      'riskScore': instance.riskScore,
      'expiresAt': instance.expiresAt,
    };
