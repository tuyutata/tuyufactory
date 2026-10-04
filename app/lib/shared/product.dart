abstract final class TuyuFactoryProduct {
  static const id = 'tuyufactory';
  static const technicalName = 'TuyuFactory';
  static const displayName = '途遇厂家端';
  // 主机保留既有身份；分机使用独立命名空间，保证同机安装和 SDK 数据不互相覆盖。
  static const hostApplicationId = 'com.tuyufactory';
  static const clientApplicationId = 'com.tuyufactory.client';

  // 只登记安装目标，不表示实现已就绪，也不参与运行时角色选择或发布路由。
  // 平台使用产品公开名称；CPU 架构由各原生工程和打包合同单独约束。
  static const targets = <String, List<String>>{
    'host': ['macOS', 'Windows', 'LinuxARM', 'LinuxAMD'],
    'client': ['iOS', 'Android', 'macOS', 'Windows'],
  };

  static List<String> get supportedPlatforms => List.unmodifiable(
    targets.values.expand((platforms) => platforms).toSet(),
  );
}
