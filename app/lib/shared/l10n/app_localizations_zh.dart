// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get hostStorageFailed => '无法读取或保存本设备的主机信任资料。请检查应用存储权限和资料完整性；不会覆盖现有文件。';

  @override
  String get hostDiscoveryFailed => '局域网发现不可用，请检查本应用的本地网络权限和网络连接。';

  @override
  String get hostNotFound => '未发现厂家主机，请确认主机管理员已开启局域网访问。';

  @override
  String get hostMultiple => '发现多台厂家主机，不能自动选择或信任其中一台。';

  @override
  String get hostVerificationFailed =>
      '固定主机未通过安全连接检查。请核对主机是否在线、证书是否变化和安装实例是否一致。';

  @override
  String get hostConnection => '厂家主机连接';

  @override
  String get hostIdle => '尚未连接厂家主机。';

  @override
  String get hostDiscovering => '正在局域网查找唯一厂家主机。请先由主机管理员启用局域网访问。';

  @override
  String get hostTrust => '请与厂家主机屏幕上的安装实例和完整证书指纹逐项核对。一致后才能确认信任；局域网广播本身不可信。';

  @override
  String get hostConnecting => '正在验证固定主机的 TLS 证书、主机名与安装实例。';

  @override
  String get hostReady => '厂家主机安全连接已验证，不代表员工已登录。';

  @override
  String get hostFailed =>
      '主机连接未通过。请检查网络、主机访问开关和固定身份；首次发现必须只有一台主机。已保存资料不会被自动替换。';

  @override
  String get hostConfirm => '已核对一致，信任并连接';

  @override
  String get hostCancel => '暂不信任';

  @override
  String get hostRetry => '检查主机连接';

  @override
  String get appTitle => '途遇厂家端';

  @override
  String get clientTitle => '厂家分机';

  @override
  String get clientUnavailable =>
      '员工登录、会话和业务功能由主机上的 ERPNext 原生界面提供。本分机不启动厂家业务数据库或主机服务。';

  @override
  String get openWorkspace => '进入 ERPNext 工作区';

  @override
  String get workspaceFailed => '工作区未能安全打开或连接已中断，请检查主机后重试。';

  @override
  String get runtimeTitle => '厂家本地系统';

  @override
  String get runtimeDescription =>
      '途遇厂家端在本机独立运行 PostgreSQL、Frappe 和 ERPNext。数据库与内部端口不会公开。';

  @override
  String get starting => '正在启动';

  @override
  String get ready => '已就绪';

  @override
  String get failed => '启动失败';

  @override
  String get stopped => '已停止';

  @override
  String get startingRuntime => '正在初始化厂家数据库和 ERPNext，首次启动可能需要较长时间。';

  @override
  String get runtimeFailed => '厂家本地系统启动失败。';

  @override
  String get runtimeReady => '厂家本地系统已经就绪。';

  @override
  String get retry => '重新启动';

  @override
  String get initializeAdministrator => '初始化途遇厂家端管理员';

  @override
  String get initializeAdministratorDescription =>
      '取得本机挑战并提交途遇账户的签名响应。本机会话独立，ERPNext 员工账户不会被修改。';

  @override
  String get administratorName => '管理员名称（可选）';

  @override
  String get initialize => '完成初始化';

  @override
  String get citizenSdkTitle => 'CitizenSDK 设备轻节点';

  @override
  String get citizenSdkStarting => '正在启动本设备 CitizenSDK。';

  @override
  String get citizenSdkReady => '本设备 CitizenSDK 已就绪。';

  @override
  String get citizenSdkUnavailable => '本设备 CitizenSDK 不可用。';

  @override
  String get citizenSdkRetry => '重新启动 CitizenSDK';

  @override
  String citizenSdkCapabilityCount(int count) {
    return '当前就绪能力：$count 项';
  }

  @override
  String get walletTitle => '钱包初始化';

  @override
  String get walletSubtitle => '创建或导入钱包。请妥善保管助记词及所设置的附加密码。';

  @override
  String get walletOperationFailed => '钱包操作失败，请重试。';

  @override
  String get walletCreate => '创建钱包';

  @override
  String get walletImport => '导入钱包';

  @override
  String get walletAddAccount => '添加账户';

  @override
  String get administratorResponse => 'QR_V1 签名响应';

  @override
  String get employeeAccess => '员工分机连接';

  @override
  String get gatewayUnknown => '局域网状态尚未确认';

  @override
  String get gatewayEnabled => '局域网访问已开启';

  @override
  String get gatewayDisabled => '局域网访问已关闭';

  @override
  String get enableGateway => '启用局域网访问';

  @override
  String get disableGateway => '停止局域网访问';

  @override
  String get refreshGateway => '刷新连接状态';

  @override
  String get realtimeUnavailable => '上游实时服务不可用；实时连接尚未接通。';

  @override
  String get administratorLoginRequired => '请先认证本机途遇管理员，再管理局域网访问。';

  @override
  String get createChallenge => '获取管理员签名挑战';

  @override
  String get administratorLogin => '验证并登录';

  @override
  String get instanceId => '安装实例 ID';

  @override
  String get certificateSha256 => 'TLS 证书 SHA-256 指纹';
}
