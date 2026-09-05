/// BEYU OS Mobile — Application Configuration
/// 
/// Central configuration for API endpoints and environment.
/// No secrets are stored here — all sensitive values come from environment.

class AppConfig {
  // API base URL — configure per environment
  static const String apiBaseUrl = String.fromEnvironment(
    'BEYU_API_URL',
    defaultValue: 'https://api.beyu.os',
  );

  // Session token storage key
  static const String tokenStorageKey = 'beyu_session_token';
  
  // Authorization context cache duration (seconds)
  static const int contextCacheSeconds = 60;
  
  // Request timeout (seconds)
  static const int requestTimeoutSeconds = 30;
  
  // Connect timeout (seconds)
  static const int connectTimeoutSeconds = 15;
  
  // App name
  static const String appName = 'BEYU OS';
  
  // App version
  static const String appVersion = '1.0.0';
}
