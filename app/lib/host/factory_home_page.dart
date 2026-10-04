import 'dart:async';
import 'dart:isolate';
import 'dart:typed_data';
import 'package:flutter_lite_camera/flutter_lite_camera.dart';
import 'package:zxing2/qrcode.dart';
import 'package:citizen_sdk/citizen_sdk.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tuyufactory/host/app_scope.dart';
import 'package:tuyufactory/host/runtime_model.dart';
import 'package:tuyufactory/host/employee_access_page.dart';
import 'package:tuyufactory/host/runtime_status_card.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';

class FactoryHomePage extends StatefulWidget {
  const FactoryHomePage({super.key});

  @override
  State<FactoryHomePage> createState() => _FactoryHomePageState();
}

class _FactoryHomePageState extends State<FactoryHomePage> {
  CitizenWalletProfile? _walletProfile;
  bool _walletOperationRunning = false;
  String? _walletError;

  Future<void> _runWalletOperation(
    Future<CitizenWalletProfile> Function() operation,
  ) async {
    if (_walletOperationRunning) return;
    setState(() {
      _walletOperationRunning = true;
      _walletError = null;
    });
    try {
      final profile = await operation();
      if (mounted) setState(() => _walletProfile = profile);
    } on Object catch (error) {
      if (mounted) setState(() => _walletError = error.toString());
    } finally {
      if (mounted) setState(() => _walletOperationRunning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final localizations = AppLocalizations.of(context);
    final runtime = context.watch<FactoryRuntimeModel>();
    if (runtime.phase == FactoryRuntimePhase.needsAdministrator) {
      return const _AdministratorSetup();
    }
    final citizen = context.watch<FactoryCitizenState>();
    final profile = _walletProfile ?? citizen.profile;

    return Scaffold(
      appBar: AppBar(title: Text(localizations.appTitle)),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Image.asset(
                'tuyu_logo.png',
                width: 88,
                height: 88,
                semanticLabel: localizations.appTitle,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            localizations.runtimeTitle,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 8),
          Text(localizations.runtimeDescription),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    localizations.citizenSdkTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  if (citizen.starting)
                    Text(localizations.citizenSdkStarting)
                  else if (citizen.sdk == null ||
                      citizen.capabilities == null) ...[
                    Text(localizations.citizenSdkUnavailable),
                    if (citizen.error case final error?) ...[
                      const SizedBox(height: 8),
                      Text(error),
                    ],
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: citizen.retry,
                      child: Text(localizations.citizenSdkRetry),
                    ),
                  ] else ...[
                    Text(localizations.citizenSdkReady),
                    if (citizen.capabilities case final capabilities?)
                      Text(
                        localizations.citizenSdkCapabilityCount(
                          capabilities.statuses
                              .where((status) => status.ready)
                              .length,
                        ),
                      ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        if (profile == null) ...[
                          FilledButton(
                            onPressed: _walletOperationRunning
                                ? null
                                : () => _runWalletOperation(
                                    citizen.sdk!.wallet.create,
                                  ),
                            child: Text(localizations.walletCreate),
                          ),
                          OutlinedButton(
                            onPressed: _walletOperationRunning
                                ? null
                                : () => _runWalletOperation(
                                    citizen.sdk!.wallet.importWallet,
                                  ),
                            child: Text(localizations.walletImport),
                          ),
                        ] else
                          OutlinedButton(
                            onPressed: _walletOperationRunning
                                ? null
                                : () async {
                                    final nextIndex =
                                        profile.accounts
                                            .map((account) => account.index)
                                            .fold<int>(
                                              -1,
                                              (a, b) => a > b ? a : b,
                                            ) +
                                        1;
                                    await _runWalletOperation(
                                      () => citizen.sdk!.wallet.addAccounts([
                                        nextIndex,
                                      ]),
                                    );
                                  },
                            child: Text(localizations.walletAddAccount),
                          ),
                      ],
                    ),
                    if (_walletError case final error?) ...[
                      const SizedBox(height: 8),
                      Text(error),
                    ],
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (runtime.phase == FactoryRuntimePhase.starting) ...[
            const Center(child: CircularProgressIndicator()),
            const SizedBox(height: 12),
            Center(child: Text(localizations.startingRuntime)),
          ],
          for (final component in runtime.components)
            RuntimeStatusCard(component: component),
          if (runtime.phase == FactoryRuntimePhase.failed)
            Card(
              color: Theme.of(context).colorScheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(runtime.error ?? localizations.runtimeFailed),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: runtime.initialize,
                      child: Text(localizations.retry),
                    ),
                  ],
                ),
              ),
            ),
          if (runtime.phase == FactoryRuntimePhase.ready)
            EmployeeAccessPage(controller: runtime.employeeAccess),
          if (runtime.phase == FactoryRuntimePhase.ready)
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  '${localizations.runtimeReady}\n${runtime.httpsOrigin ?? ''}',
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// 初始化只通过本机摄像头接收响应；此页面不接收钱包秘密，也不提供文本粘贴旁路。
final class _AdministratorSetup extends StatefulWidget {
  const _AdministratorSetup();

  @override
  State<_AdministratorSetup> createState() => _AdministratorSetupState();
}

final class _AdministratorSetupState extends State<_AdministratorSetup> {
  final _name = TextEditingController();
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    _requested = true;
    final runtime = context.read<FactoryRuntimeModel>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(runtime.createAdministratorChallenge());
    });
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final runtime = context.watch<FactoryRuntimeModel>();
    final challenge = runtime.administratorChallenge;
    final busy = runtime.initializingAdministrator;
    final failed = runtime.error != null;
    return Scaffold(
      backgroundColor: const Color(0xFF092D24),
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF173F32), Color(0xFF08241E)],
        )),
        child: SafeArea(child: Center(child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 790),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(child: ClipRRect(borderRadius: BorderRadius.circular(16),
                child: Image.asset('tuyu_logo.png', width: 72,
                  height: 72, excludeFromSemantics: true))),
              const SizedBox(height: 12),
              const _AdministratorCopy('途遇厂家端', 'TuyuFactory'),
              const SizedBox(height: 12),
              const _AdministratorCopy('设置管理员', 'Set administrator',
                key: ValueKey('administrator-initialization-title'), heading: true),
              const SizedBox(height: 16),
              Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 400),
                child: TextField(
                  key: const ValueKey('administrator-name-field'),
                  controller: _name, maxLength: 30, enabled: !busy,
                  style: const TextStyle(color: Color(0xFFF3EFDE)),
                  decoration: const InputDecoration(
                    label: _AdministratorCopy('管理员姓名（选填）', 'Name (optional)'),
                    counterText: '', filled: true, fillColor: Color(0x66123E32),
                    border: OutlineInputBorder(),
                  ),
                ))),
              const SizedBox(height: 22),
              LayoutBuilder(builder: (context, constraints) {
                final extent = constraints.maxWidth >= 700
                    ? (constraints.maxWidth - 24) / 2
                    : constraints.maxWidth.clamp(0.0, 360.0).toDouble();
                final request = _panel(extent, '签名二维码', 'SIGNATURE QR',
                  const ValueKey('signature-request-panel'),
                  challenge == null
                    ? _placeholder(busy)
                    : CustomPaint(key: const ValueKey('administrator-initialization-challenge-qr'),
                        painter: _AdministratorQrPainter(challenge)));
                final response = _panel(extent, '扫码识别', 'SCAN',
                  const ValueKey('signature-response-panel'),
                  challenge == null ? _placeholder(busy) : _AdministratorCamera(
                    key: ValueKey(challenge),
                    onScanned: (raw) async {
                      if (!mounted) return;
                      await runtime.initializeAdministrator(response: raw, name: _name.text);
                    },
                  ));
                if (constraints.maxWidth >= 700) {
                  return Row(children: [request, const SizedBox(width: 24), response]);
                }
                return Column(children: [request, const SizedBox(height: 20), response]);
              }),
              const SizedBox(height: 16),
              _AdministratorCopy(
                busy ? '正在处理' : failed ? '验证未完成，请刷新二维码重试' : '等待签名',
                busy ? 'Processing' : failed ? 'Refresh the QR and try again' : 'Waiting for signature',
                key: failed ? const ValueKey('signature-error') : null),
              const SizedBox(height: 8),
              Center(child: TextButton.icon(
                key: const ValueKey('refresh-administrator-qr'),
                onPressed: busy ? null : runtime.createAdministratorChallenge,
                icon: const Icon(Icons.refresh, color: Color(0xFFD5A95D)),
                label: const _AdministratorCopy('刷新二维码', 'Refresh QR'),
              )),
            ]),
          ),
        ))),
      ),
    );
  }

  Widget _placeholder(bool busy) => Center(child: busy
      ? const CircularProgressIndicator(color: Color(0xFFD5A95D))
      : const Icon(Icons.qr_code_2, color: Color(0xFFD5A95D), size: 56));

  Widget _panel(double extent, String zh, String en, Key key, Widget child) =>
      SizedBox.square(key: key, dimension: extent, child: DecoratedBox(
        decoration: BoxDecoration(color: const Color(0xE6123E32),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0x99D5A95D))),
        child: Padding(padding: const EdgeInsets.all(18), child: Column(children: [
          _AdministratorCopy(zh, en), const SizedBox(height: 12),
          Expanded(child: Center(child: AspectRatio(aspectRatio: 1,
            child: ClipRRect(borderRadius: BorderRadius.circular(10), child: child)))),
        ])),
      ));
}

final class _AdministratorCopy extends StatelessWidget {
  const _AdministratorCopy(this.zh, this.en, {this.heading = false, super.key});
  final String zh;
  final String en;
  final bool heading;
  @override
  Widget build(BuildContext context) {
    final chinese = Localizations.localeOf(context).languageCode == 'zh';
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Text(chinese ? zh : en, textAlign: TextAlign.center,
        style: TextStyle(color: const Color(0xFFF3EFDE),
          fontSize: heading ? 30 : 15, fontWeight: FontWeight.w700)),
      const SizedBox(height: 3),
      Text(chinese ? en : zh, textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFFD5A95D), fontSize: 11)),
    ]);
  }
}

// 二维码由原生返回的原始挑战字符串直接编码，保留4模块静区，不调用网络图片服务。
final class _AdministratorQrPainter extends CustomPainter {
  _AdministratorQrPainter(String payload) : code = Encoder.encode(payload, ErrorCorrectionLevel.m);
  final QRCode code;
  @override
  void paint(Canvas canvas, Size size) {
    final matrix = code.matrix!;
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
    final unit = size.shortestSide / (matrix.width + 8);
    final paint = Paint()..color = Colors.black;
    for (var y = 0; y < matrix.height; y++) {
      for (var x = 0; x < matrix.width; x++) {
        if (matrix.get(x, y) == 1) {
          canvas.drawRect(Rect.fromLTWH((x + 4) * unit, (y + 4) * unit,
            unit + 0.1, unit + 0.1), paint);
        }
      }
    }
  }
  @override
  bool shouldRepaint(_AdministratorQrPainter oldDelegate) => code != oldDelegate.code;
}

final class _AdministratorCamera extends StatefulWidget {
  const _AdministratorCamera({required this.onScanned, super.key});
  final Future<void> Function(String) onScanned;
  @override
  State<_AdministratorCamera> createState() => _AdministratorCameraState();
}

final class _AdministratorCameraState extends State<_AdministratorCamera>
    with WidgetsBindingObserver {
  final _camera = FlutterLiteCamera();
  late final Future<void> _starting;
  Future<void>? _closing;
  Timer? _timer;
  int? _texture;
  bool _unavailable = false;
  bool _decoding = false;
  bool _accepted = false;
  bool _suspended = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _starting = _start();
  }

  Future<void> _start() async {
    try {
      final devices = await _camera.getDeviceList();
      if (!mounted || _suspended) return;
      if (devices.isEmpty || !await _camera.open(0)) throw StateError('Camera unavailable');
      if (!mounted || _suspended) return;
      final texture = await _camera.startPreview();
      if (!mounted || _suspended) return;
      if (texture < 0) throw StateError('Camera preview unavailable');
      setState(() => _texture = texture);
      _timer = Timer.periodic(const Duration(milliseconds: 350), (_) => unawaited(_capture()));
    } on Object {
      if (mounted) setState(() => _unavailable = true);
      // 异常也释放设备；异步排队，避免在启动函数内部等待自身结束。
      unawaited(_close());
    }
  }

  Future<void> _capture() async {
    if (_decoding || _accepted || _suspended || !mounted) return;
    _decoding = true;
    try {
      final frame = await _camera.captureFrame();
      final bytes = frame['data'];
      final width = frame['width'];
      final height = frame['height'];
      if (bytes is! Uint8List || width is! int || height is! int ||
          width <= 0 || height <= 0 || width > 4096 || height > 4096 ||
          bytes.length != width * height * 3) return;
      final value = await Isolate.run(() => _decodeAdministratorFrame(bytes, width, height));
      if (value == null || !mounted || _suspended) return;
      _accepted = true;
      _timer?.cancel();
      await _close();
      if (mounted && !_suspended) await widget.onScanned(value);
    } on Object {
      // 尚未对准完整二维码不属于认证错误，也不输出帧或识别内容。
    } finally {
      _decoding = false;
    }
  }

  Future<void> _close() => _closing ??= _release();
  Future<void> _release() async {
    _timer?.cancel();
    await _starting;
    // startPreview可能晚于dispose完成；无论纹理是否已进入界面都执行停止和释放。
    try { await _camera.stopPreview(); } on Object { /* 继续释放设备。 */ }
    try { await _camera.release(); } on Object { /* 页面不暴露平台异常内容。 */ }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed || _suspended) return;
    _suspended = true;
    _timer?.cancel();
    if (mounted) setState(() => _unavailable = true);
    unawaited(_close());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    unawaited(_close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ColoredBox(color: const Color(0xFF08241E),
    child: Stack(fit: StackFit.expand, children: [
      if (_texture != null && !_unavailable) Texture(textureId: _texture!),
      if (_unavailable) const Center(child: Padding(padding: EdgeInsets.all(12),
        child: _AdministratorCopy('摄像头不可用，刷新二维码重试', 'Camera unavailable. Refresh QR to retry')))
      else if (_texture == null) const Center(child: CircularProgressIndicator())
      else const Align(alignment: Alignment.bottomCenter,
        child: ColoredBox(color: Color(0xCC08241E), child: Padding(padding: EdgeInsets.all(8),
          child: _AdministratorCopy('对准签名二维码', 'Show signed QR')))),
    ]));
}

String? _decodeAdministratorFrame(Uint8List bytes, int width, int height) {
  final pixels = Int32List(width * height);
  for (var i = 0; i < pixels.length; i++) {
    final offset = i * 3;
    pixels[i] = 0xff000000 | (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
  }
  try {
    return QRCodeReader().decode(BinaryBitmap(HybridBinarizer(
      RGBLuminanceSource(width, height, pixels)))).text;
  } on Object {
    return null;
  }
}
