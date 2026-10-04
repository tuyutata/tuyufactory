import 'dart:async';
import 'dart:ui' show AppExitResponse;

import 'package:citizen_sdk/citizen_sdk.dart';
import 'package:flutter/material.dart';
import 'package:tuyufactory/client/connection_page.dart';
import 'package:tuyufactory/client/host_connection.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';

class ClientApp extends StatefulWidget {
  const ClientApp({
    this.locale,
    this.startCitizenSdk = true,
    this.connectHost = true,
    super.key,
  });

  final Locale? locale;
  final bool startCitizenSdk;
  final bool connectHost;

  @override
  State<ClientApp> createState() => _ClientAppState();
}

final class _ClientAppState extends State<ClientApp> {
  late final AppLifecycleListener _lifecycle;
  late final HostConnection _connection;
  CitizenSdk? _sdk;
  CitizenCapabilitySnapshot? _capabilities;
  CitizenWalletProfile? _profile;
  StreamSubscription<CitizenSdkEvent>? _events;
  Future<void>? _starting;
  Future<void>? _stopping;
  String? _error;
  bool _hostStarted = false;

  @override
  void initState() {
    super.initState();
    _connection = HostConnection();
    _lifecycle = AppLifecycleListener(
      onExitRequested: _stopBeforeExit,
      onStateChange: (state) =>
          _connection.setMonitoring(state == AppLifecycleState.resumed),
      onDetach: () {
        _connection.dispose();
        unawaited(_stopSdk());
      },
    );
    if (widget.startCitizenSdk) unawaited(_startSdk());
  }

  void _connectWalletHost() {
    // 钱包就绪后才启动既有主机连接；钱包并不替代上游员工登录。
    if (!mounted || !widget.connectHost || _hostStarted) return;
    _hostStarted = true;
    unawaited(_connection.start());
  }

  Future<AppExitResponse> _stopBeforeExit() async {
    try {
      await _stopSdk();
      _connection.dispose();
      return AppExitResponse.exit;
    } on Object catch (error) {
      if (mounted) setState(() => _error = error.toString());
      return AppExitResponse.cancel;
    }
  }

  Future<void> _startSdk() {
    final starting = _starting;
    if (starting != null) return starting;
    if (_sdk != null) return _restartSdk();
    final operation = _openAndStartSdk();
    _starting = operation;
    return operation;
  }

  Future<void> _restartSdk() async {
    try {
      await _stopSdk();
      _stopping = null;
      await _startSdk();
    } on Object catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _openAndStartSdk() async {
    if (mounted) {
      setState(() {
        _error = null;
        _stopping = null;
      });
    }
    CitizenSdk? sdk;
    StreamSubscription<CitizenSdkEvent>? events;
    try {
      sdk = await CitizenSdk.open();
      // 分机设备独立持有同一完整 SDK，且在 start 前开始接收事件。
      events = sdk.events.listen(
        _handleSdkEvent,
        onError: (Object error, StackTrace _) {
          if (mounted) setState(() => _error = error.toString());
        },
      );
      _sdk = sdk;
      _events = events;
      await sdk.start();
      final capabilities = await sdk.getCapabilities();
      final profile = await sdk.wallet.getProfile();
      if (!mounted) {
        if (sdk.lifecycle == CitizenSdkLifecycle.running) await sdk.stop();
        await sdk.close();
        await events.cancel();
        _events = null;
        _sdk = null;
        return;
      }
      setState(() {
        _capabilities = capabilities;
        _profile = profile;
        _error = null;
      });
      if (profile != null) _connectWalletHost();
    } on Object catch (error) {
      Object reportedError = error;
      if (sdk != null && identical(_sdk, sdk)) {
        try {
          await _closeFailedStart(sdk);
        } on Object catch (closeError) {
          reportedError = '$error\n$closeError';
        }
      } else {
        await events?.cancel();
      }
      if (mounted) setState(() => _error = reportedError.toString());
    } finally {
      _starting = null;
      if (mounted) setState(() {});
    }
  }

  Future<void> _closeFailedStart(CitizenSdk sdk) async {
    if (sdk.lifecycle == CitizenSdkLifecycle.running) await sdk.stop();
    await sdk.close();
    await _events?.cancel();
    _events = null;
    _sdk = null;
    _capabilities = null;
    _profile = null;
  }

  void _handleSdkEvent(CitizenSdkEvent event) {
    if (!mounted) return;
    if (event case CitizenSdkCapabilitiesChanged(:final snapshot)) {
      setState(() => _capabilities = snapshot);
    } else if (event case CitizenSdkLifecycleChanged(:final lifecycle)) {
      if (lifecycle == CitizenSdkLifecycle.startFailed) {
        setState(() => _error = 'CitizenSDK 启动失败');
      }
    }
  }

  Future<void> _stopSdk() {
    final stopping = _stopping;
    if (stopping != null) return stopping;
    final operation = _performStopSdk();
    _stopping = operation;
    return operation;
  }

  Future<void> _performStopSdk() async {
    final starting = _starting;
    if (starting != null) await starting;
    final sdk = _sdk;
    if (sdk == null) return;
    try {
      if (sdk.lifecycle == CitizenSdkLifecycle.running) await sdk.stop();
      await sdk.close();
      await _events?.cancel();
      _events = null;
      _sdk = null;
      _capabilities = null;
      _profile = null;
    } on Object {
      _stopping = null;
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: widget.locale,
      localeResolutionCallback: (locale, supportedLocales) =>
          Locale(locale?.languageCode == 'en' ? 'en' : 'zh'),
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B6E69)),
        useMaterial3: true,
      ),
      home: ConnectionPage(
        connection: _connection,
        sdk: _sdk,
        capabilities: _capabilities,
        profile: _profile,
        sdkStarting: _starting != null,
        sdkError: _error,
        onRetrySdk: _startSdk,
        onWalletReady: _connectWalletHost,
      ),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _connection.dispose();
    unawaited(_stopSdk());
    super.dispose();
  }
}
