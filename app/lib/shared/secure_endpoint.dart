/// 仅校验 HTTPS 地址格式，不发起连接，也不验证证书或主机身份。
/// 实际连接仍须验证 TLS 证书与主机名，不能以解析成功作为信任依据。
class SecureEndpoint {
  SecureEndpoint._(this.uri);

  final Uri uri;

  static SecureEndpoint parse(String value) {
    final uri = Uri.parse(value);
    if (uri.scheme != 'https' || uri.host.isEmpty || uri.userInfo.isNotEmpty) {
      throw const FormatException('厂家端网络端点必须使用无用户信息的 HTTPS 地址');
    }
    return SecureEndpoint._(uri);
  }
}
