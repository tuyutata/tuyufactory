import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('zh'),
  ];

  /// No description provided for @hostStorageFailed.
  ///
  /// In zh, this message translates to:
  /// **'无法读取或保存本设备的主机信任资料。请检查应用存储权限和资料完整性；不会覆盖现有文件。'**
  String get hostStorageFailed;

  /// No description provided for @hostDiscoveryFailed.
  ///
  /// In zh, this message translates to:
  /// **'局域网发现不可用，请检查本应用的本地网络权限和网络连接。'**
  String get hostDiscoveryFailed;

  /// No description provided for @hostNotFound.
  ///
  /// In zh, this message translates to:
  /// **'未发现厂家主机，请确认主机管理员已开启局域网访问。'**
  String get hostNotFound;

  /// No description provided for @hostMultiple.
  ///
  /// In zh, this message translates to:
  /// **'发现多台厂家主机，不能自动选择或信任其中一台。'**
  String get hostMultiple;

  /// No description provided for @hostVerificationFailed.
  ///
  /// In zh, this message translates to:
  /// **'固定主机未通过安全连接检查。请核对主机是否在线、证书是否变化和安装实例是否一致。'**
  String get hostVerificationFailed;

  /// No description provided for @hostConnection.
  ///
  /// In zh, this message translates to:
  /// **'厂家主机连接'**
  String get hostConnection;

  /// No description provided for @hostIdle.
  ///
  /// In zh, this message translates to:
  /// **'尚未连接厂家主机。'**
  String get hostIdle;

  /// No description provided for @hostDiscovering.
  ///
  /// In zh, this message translates to:
  /// **'正在局域网查找唯一厂家主机。请先由主机管理员启用局域网访问。'**
  String get hostDiscovering;

  /// No description provided for @hostTrust.
  ///
  /// In zh, this message translates to:
  /// **'请与厂家主机屏幕上的安装实例和完整证书指纹逐项核对。一致后才能确认信任；局域网广播本身不可信。'**
  String get hostTrust;

  /// No description provided for @hostConnecting.
  ///
  /// In zh, this message translates to:
  /// **'正在验证固定主机的 TLS 证书、主机名与安装实例。'**
  String get hostConnecting;

  /// No description provided for @hostReady.
  ///
  /// In zh, this message translates to:
  /// **'厂家主机安全连接已验证，不代表员工已登录。'**
  String get hostReady;

  /// No description provided for @hostFailed.
  ///
  /// In zh, this message translates to:
  /// **'主机连接未通过。请检查网络、主机访问开关和固定身份；首次发现必须只有一台主机。已保存资料不会被自动替换。'**
  String get hostFailed;

  /// No description provided for @hostConfirm.
  ///
  /// In zh, this message translates to:
  /// **'已核对一致，信任并连接'**
  String get hostConfirm;

  /// No description provided for @hostCancel.
  ///
  /// In zh, this message translates to:
  /// **'暂不信任'**
  String get hostCancel;

  /// No description provided for @hostRetry.
  ///
  /// In zh, this message translates to:
  /// **'检查主机连接'**
  String get hostRetry;

  /// No description provided for @appTitle.
  ///
  /// In zh, this message translates to:
  /// **'途遇厂家端'**
  String get appTitle;

  /// 厂家分机接入状态标题
  ///
  /// In zh, this message translates to:
  /// **'厂家分机'**
  String get clientTitle;

  /// 分机尚未完成实际接入时的明确说明，不表示连接成功
  ///
  /// In zh, this message translates to:
  /// **'员工登录、会话和业务功能由主机上的 ERPNext 原生界面提供。本分机不启动厂家业务数据库或主机服务。'**
  String get clientUnavailable;

  /// No description provided for @openWorkspace.
  ///
  /// In zh, this message translates to:
  /// **'进入 ERPNext 工作区'**
  String get openWorkspace;

  /// No description provided for @workspaceFailed.
  ///
  /// In zh, this message translates to:
  /// **'工作区未能安全打开或连接已中断，请检查主机后重试。'**
  String get workspaceFailed;

  /// No description provided for @runtimeTitle.
  ///
  /// In zh, this message translates to:
  /// **'厂家本地系统'**
  String get runtimeTitle;

  /// No description provided for @runtimeDescription.
  ///
  /// In zh, this message translates to:
  /// **'途遇厂家端在本机独立运行 PostgreSQL、Frappe 和 ERPNext。数据库与内部端口不会公开。'**
  String get runtimeDescription;

  /// No description provided for @starting.
  ///
  /// In zh, this message translates to:
  /// **'正在启动'**
  String get starting;

  /// No description provided for @ready.
  ///
  /// In zh, this message translates to:
  /// **'已就绪'**
  String get ready;

  /// No description provided for @failed.
  ///
  /// In zh, this message translates to:
  /// **'启动失败'**
  String get failed;

  /// No description provided for @stopped.
  ///
  /// In zh, this message translates to:
  /// **'已停止'**
  String get stopped;

  /// No description provided for @startingRuntime.
  ///
  /// In zh, this message translates to:
  /// **'正在初始化厂家数据库和 ERPNext，首次启动可能需要较长时间。'**
  String get startingRuntime;

  /// No description provided for @runtimeFailed.
  ///
  /// In zh, this message translates to:
  /// **'厂家本地系统启动失败。'**
  String get runtimeFailed;

  /// No description provided for @runtimeReady.
  ///
  /// In zh, this message translates to:
  /// **'厂家本地系统已经就绪。'**
  String get runtimeReady;

  /// No description provided for @retry.
  ///
  /// In zh, this message translates to:
  /// **'重新启动'**
  String get retry;

  /// No description provided for @initializeAdministrator.
  ///
  /// In zh, this message translates to:
  /// **'初始化途遇厂家端管理员'**
  String get initializeAdministrator;

  /// No description provided for @initializeAdministratorDescription.
  ///
  /// In zh, this message translates to:
  /// **'取得本机挑战并提交途遇账户的签名响应。本机会话独立，ERPNext 员工账户不会被修改。'**
  String get initializeAdministratorDescription;

  /// No description provided for @administratorName.
  ///
  /// In zh, this message translates to:
  /// **'管理员名称（可选）'**
  String get administratorName;

  /// No description provided for @initialize.
  ///
  /// In zh, this message translates to:
  /// **'完成初始化'**
  String get initialize;

  /// No description provided for @citizenSdkTitle.
  ///
  /// In zh, this message translates to:
  /// **'CitizenSDK 设备轻节点'**
  String get citizenSdkTitle;

  /// No description provided for @citizenSdkStarting.
  ///
  /// In zh, this message translates to:
  /// **'正在启动本设备 CitizenSDK。'**
  String get citizenSdkStarting;

  /// No description provided for @citizenSdkReady.
  ///
  /// In zh, this message translates to:
  /// **'本设备 CitizenSDK 已就绪。'**
  String get citizenSdkReady;

  /// No description provided for @citizenSdkUnavailable.
  ///
  /// In zh, this message translates to:
  /// **'本设备 CitizenSDK 不可用。'**
  String get citizenSdkUnavailable;

  /// No description provided for @citizenSdkRetry.
  ///
  /// In zh, this message translates to:
  /// **'重新启动 CitizenSDK'**
  String get citizenSdkRetry;

  /// No description provided for @citizenSdkCapabilityCount.
  ///
  /// In zh, this message translates to:
  /// **'当前就绪能力：{count} 项'**
  String citizenSdkCapabilityCount(int count);

  /// No description provided for @walletTitle.
  ///
  /// In zh, this message translates to:
  /// **'钱包初始化'**
  String get walletTitle;

  /// No description provided for @walletSubtitle.
  ///
  /// In zh, this message translates to:
  /// **'创建或导入钱包。请妥善保管助记词及所设置的附加密码。'**
  String get walletSubtitle;

  /// No description provided for @walletOperationFailed.
  ///
  /// In zh, this message translates to:
  /// **'钱包操作失败，请重试。'**
  String get walletOperationFailed;

  /// No description provided for @walletCreate.
  ///
  /// In zh, this message translates to:
  /// **'创建钱包'**
  String get walletCreate;

  /// No description provided for @walletImport.
  ///
  /// In zh, this message translates to:
  /// **'导入钱包'**
  String get walletImport;

  /// No description provided for @walletAddAccount.
  ///
  /// In zh, this message translates to:
  /// **'添加账户'**
  String get walletAddAccount;

  /// No description provided for @administratorResponse.
  ///
  /// In zh, this message translates to:
  /// **'QR_V1 签名响应'**
  String get administratorResponse;

  /// No description provided for @employeeAccess.
  ///
  /// In zh, this message translates to:
  /// **'员工分机连接'**
  String get employeeAccess;

  /// No description provided for @gatewayUnknown.
  ///
  /// In zh, this message translates to:
  /// **'局域网状态尚未确认'**
  String get gatewayUnknown;

  /// No description provided for @gatewayEnabled.
  ///
  /// In zh, this message translates to:
  /// **'局域网访问已开启'**
  String get gatewayEnabled;

  /// No description provided for @gatewayDisabled.
  ///
  /// In zh, this message translates to:
  /// **'局域网访问已关闭'**
  String get gatewayDisabled;

  /// No description provided for @enableGateway.
  ///
  /// In zh, this message translates to:
  /// **'启用局域网访问'**
  String get enableGateway;

  /// No description provided for @disableGateway.
  ///
  /// In zh, this message translates to:
  /// **'停止局域网访问'**
  String get disableGateway;

  /// No description provided for @refreshGateway.
  ///
  /// In zh, this message translates to:
  /// **'刷新连接状态'**
  String get refreshGateway;

  /// No description provided for @realtimeUnavailable.
  ///
  /// In zh, this message translates to:
  /// **'上游实时服务不可用；实时连接尚未接通。'**
  String get realtimeUnavailable;

  /// No description provided for @administratorLoginRequired.
  ///
  /// In zh, this message translates to:
  /// **'请先认证本机途遇管理员，再管理局域网访问。'**
  String get administratorLoginRequired;

  /// No description provided for @createChallenge.
  ///
  /// In zh, this message translates to:
  /// **'获取管理员签名挑战'**
  String get createChallenge;

  /// No description provided for @administratorLogin.
  ///
  /// In zh, this message translates to:
  /// **'验证并登录'**
  String get administratorLogin;

  /// No description provided for @instanceId.
  ///
  /// In zh, this message translates to:
  /// **'安装实例 ID'**
  String get instanceId;

  /// No description provided for @certificateSha256.
  ///
  /// In zh, this message translates to:
  /// **'TLS 证书 SHA-256 指纹'**
  String get certificateSha256;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
