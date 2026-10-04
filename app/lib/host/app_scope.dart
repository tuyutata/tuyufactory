import 'dart:async';
import 'dart:ui' show AppExitResponse;

import 'package:citizen_sdk/citizen_sdk.dart';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import 'package:tuyufactory/host/runtime_model.dart';

/// 仅向厂家页面公布 SDK 的真实设备状态，不转发或重写任何 SDK 功能。
final class FactoryCitizenState {
  const FactoryCitizenState({
    required this.starting,
    required this.retry,
    this.sdk,
    this.capabilities,
    this.profile,
    this.error,
  });

  final CitizenSdk? sdk;
  final CitizenCapabilitySnapshot? capabilities;
  final CitizenWalletProfile? profile;
  final bool starting;
  final String? error;
  final Future<void> Function() retry;
}

class TuyuFactoryScope extends StatefulWidget {
  const TuyuFactoryScope({
    required this.child,
    this.runtime,
    this.startCitizenSdk = true,
    super.key,
  });

  final Widget child;
  final FactoryRuntimeModel? runtime;
  final bool startCitizenSdk;

  @override
  State<TuyuFactoryScope> createState() => _TuyuFactoryScopeState();
}

final class _TuyuFactoryScopeState extends State<TuyuFactoryScope> {
  late final FactoryRuntimeModel _runtime;
  late final AppLifecycleListener _lifecycle;
  CitizenSdk? _sdk;
  CitizenCapabilitySnapshot? _capabilities;
  CitizenWalletProfile? _profile;
  StreamSubscription<CitizenSdkEvent>? _events;
  Future<void>? _starting;
  Future<void>? _stopping;
  String? _error;

  @override
  void initState() {
    super.initState();
    _runtime = widget.runtime ?? FactoryRuntimeModel();
    _lifecycle = AppLifecycleListener(
      onExitRequested: _stopBeforeExit,
      onDetach: () => unawaited(_stopServices()),
    );
    if (widget.startCitizenSdk) unawaited(_startSdk());
  }

  Future<AppExitResponse> _stopBeforeExit() async {
    try {
      await _stopServices();
      return AppExitResponse.exit;
    } on Object catch (error) {
      if (mounted) setState(() => _error = error.toString());
      return AppExitResponse.cancel;
    }
  }

  Future<void> _stopServices() =>
      Future.wait<void>([_runtime.stop(), _stopSdk()]);

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
      // 订阅必须先于 start，避免漏掉启动阶段的生命周期与能力事件。
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
      // stop 或 close 失败时保留对象，允许用户重试正常退出。
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
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<FactoryRuntimeModel>.value(value: _runtime),
        Provider<FactoryCitizenState>.value(
          value: FactoryCitizenState(
            sdk: _sdk,
            capabilities: _capabilities,
            profile: _profile,
            starting: _starting != null,
            error: _error,
            retry: _startSdk,
          ),
        ),
      ],
      child: widget.child,
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    unawaited(_stopSdk());
    _runtime.dispose();
    super.dispose();
  }
}
