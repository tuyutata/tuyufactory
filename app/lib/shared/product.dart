import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:citizen_sdk/citizen_sdk.dart';
import 'package:flutter/material.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';

abstract final class TuyuFactoryProduct {
  static const productId = 'tuyufactory';
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

// 界面仅收集临时输入；校验、派生、提交与持久化全部归SDK。
enum WalletAction { create, importWallet, add }

bool walletReady(CitizenWalletState? state) =>
    state?.initializationState == CitizenWalletInitializationState.ready &&
    state?.cleanupPending == false &&
    state?.hotProfile != null;

bool walletBlocked(CitizenWalletState? state) =>
    state?.cleanupPending == true ||
    state?.initializationState == CitizenWalletInitializationState.recovering;

Future<bool> showWalletDialog(
  BuildContext context,
  CitizenSdk sdk,
  WalletAction action,
  Future<void> cancelled,
) async =>
    await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) =>
          _WalletDialog(sdk: sdk, action: action, cancelled: cancelled),
    ) ??
    false;

Future<Uint8List?> requestWalletCredential(
  BuildContext context,
  CitizenCredentialChallenge challenge,
) => showDialog<Uint8List>(
  context: context,
  barrierDismissible: false,
  builder: (_) => _WalletCredential(challenge: challenge),
);

final class _WalletDialog extends StatefulWidget {
  const _WalletDialog({
    required this.sdk,
    required this.action,
    required this.cancelled,
  });
  final CitizenSdk sdk;
  final WalletAction action;
  final Future<void> cancelled;
  @override
  State<_WalletDialog> createState() => _WalletDialogState();
}

final class _WalletDialogState extends State<_WalletDialog> {
  final _password = TextEditingController();
  final _mnemonic = TextEditingController();
  CitizenWalletWordCount _wordCount = CitizenWalletWordCount.words24;
  CitizenSdkPreparedWallet? _prepared;
  CitizenSdkRecoveryPhrase? _phrase;
  CitizenSdkOperation<Object?>? _operation;
  Future<void>? _action;
  String? _error;
  bool _busy = false, _closing = false, _confirmed = false, _disposed = false;

  @override
  void initState() {
    super.initState();
    unawaited(widget.cancelled.then((_) => _cancel()));
  }

  Future<T> _run<T>(CitizenSdkOperation<T> operation) async {
    _operation = operation;
    try {
      return await operation.result;
    } finally {
      if (identical(_operation, operation)) _operation = null;
    }
  }

  Future<void> _release() async {
    await _phrase?.release();
    _phrase = null;
    await _prepared?.release();
    _prepared = null;
    if (mounted && !_disposed) {
      _password.clear();
      _mnemonic.clear();
    }
  }

  void _submit() {
    if (_busy || _closing) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    _action = _perform();
    unawaited(_action!);
  }

  Future<void> _perform() async {
    try {
      final sdk = widget.sdk;
      if (_prepared != null) {
        if (!_confirmed) return;
        await _run(_prepared!.commit());
      } else {
        final password = _password.text, mnemonic = _mnemonic.text;
        final valid = await sdk.wallet.validatePassword(password);
        if (_closing || !mounted) return;
        if (!valid.isValid) {
          setState(
            () => _error = AppLocalizations.of(context).walletPasswordInvalid,
          );
          return;
        }
        if (widget.action == WalletAction.create) {
          _prepared = await _run(
            sdk.wallet.prepareCreation(
              wordCount: _wordCount,
              password: password,
            ),
          );
          if (_closing || !mounted) return;
          _phrase = await _prepared!.recoveryPhrase();
          if (_closing || !mounted) return;
          _password.clear();
          setState(() {});
          return;
        }
        final words = await sdk.wallet.validateMnemonic(mnemonic, _wordCount);
        if (_closing || !mounted) return;
        if (!words.isValid) {
          setState(
            () => _error = AppLocalizations.of(context).walletMnemonicInvalid,
          );
          return;
        }
        await _run(
          widget.action == WalletAction.add
              ? sdk.wallet.addNextAccount(
                  mnemonic: mnemonic,
                  password: password,
                )
              : sdk.wallet.importWallet(mnemonic: mnemonic, password: password),
        );
      }
      await _release();
      if (_closing || !mounted) return;
      _closing = true;
      Navigator.of(context).pop(true);
    } on CitizenSdkException catch (error) {
      if (mounted && !_closing) {
        if (error.code == CitizenSdkErrorCode.cancelled ||
            error.code == CitizenSdkErrorCode.authenticationCancelled) {
          // 取消只等待本次动作结束后归还资源，不把它当成成功。
          scheduleMicrotask(() => unawaited(_cancel()));
        } else {
          setState(
            () => _error = AppLocalizations.of(context).walletOperationFailed,
          );
        }
      }
    } on Object {
      if (mounted && !_closing) {
        setState(
          () => _error = AppLocalizations.of(context).walletOperationFailed,
        );
      }
    } finally {
      if (mounted && !_closing) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    if (_closing) return;
    _closing = true;
    if (mounted && !_disposed) setState(() => _busy = true);
    try {
      await _operation?.cancel();
      await _action;
      await _release();
      if (mounted && !_disposed) {
        final route = ModalRoute.of(context);
        if (route != null && route.isActive) {
          Navigator.of(context).removeRoute(route, false);
        }
      }
    } on Object {
      _closing = false;
      if (mounted && !_disposed) {
        setState(() {
          _busy = _operation != null;
          _error = AppLocalizations.of(context).walletOperationFailed;
        });
      }
    }
  }

  @override
  void dispose() {
    // 路由被外层移除时仍等待真实操作终态和资源归还。
    _disposed = true;
    unawaited(_cancel());
    _password.clear();
    _mnemonic.clear();
    _password.dispose();
    _mnemonic.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context), backup = _phrase != null;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_cancel());
      },
      child: AlertDialog(
        title: Text(
          backup
              ? text.walletBackup
              : widget.action == WalletAction.create
              ? text.walletCreate
              : widget.action == WalletAction.add
              ? text.walletAddAccount
              : text.walletImport,
        ),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (backup) ...[
                  SelectableText(
                    utf8.decode(_phrase!.bytes),
                    key: const ValueKey('wallet-backup'),
                  ),
                  CheckboxListTile(
                    key: const ValueKey('wallet-confirm'),
                    value: _confirmed,
                    onChanged: _busy
                        ? null
                        : (value) =>
                              setState(() => _confirmed = value ?? false),
                    title: Text(text.walletConfirmed),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                ] else ...[
                  DropdownButtonFormField<CitizenWalletWordCount>(
                    key: const ValueKey('wallet-words'),
                    initialValue: _wordCount,
                    decoration: InputDecoration(labelText: text.walletWords),
                    items: [
                      for (final count in CitizenWalletWordCount.values)
                        DropdownMenuItem(
                          value: count,
                          child: Text('${count.value}'),
                        ),
                    ],
                    onChanged: _busy
                        ? null
                        : (value) {
                            if (value != null) {
                              setState(() => _wordCount = value);
                            }
                          },
                  ),
                  if (widget.action != WalletAction.create)
                    TextField(
                      key: const ValueKey('wallet-mnemonic'),
                      controller: _mnemonic,
                      enabled: !_busy,
                      maxLines: 3,
                      autocorrect: false,
                      enableSuggestions: false,
                      enableIMEPersonalizedLearning: false,
                      decoration: InputDecoration(
                        labelText: text.walletMnemonic,
                      ),
                    ),
                  TextField(
                    key: const ValueKey('wallet-password'),
                    controller: _password,
                    enabled: !_busy,
                    obscureText: true,
                    autocorrect: false,
                    enableSuggestions: false,
                    enableIMEPersonalizedLearning: false,
                    decoration: InputDecoration(labelText: text.walletPassword),
                  ),
                ],
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!),
                  ),
                if (_busy)
                  const Padding(
                    padding: EdgeInsets.all(12),
                    child: Center(child: CircularProgressIndicator()),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            key: const ValueKey('wallet-cancel'),
            onPressed: _closing ? null : _cancel,
            child: Text(text.walletCancel),
          ),
          FilledButton(
            key: const ValueKey('wallet-submit'),
            onPressed: _busy || backup && !_confirmed ? null : _submit,
            child: Text(backup ? text.walletCommit : text.walletContinue),
          ),
        ],
      ),
    );
  }
}

final class _WalletCredential extends StatefulWidget {
  const _WalletCredential({required this.challenge});
  final CitizenCredentialChallenge challenge;
  @override
  State<_WalletCredential> createState() => _WalletCredentialState();
}

final class _WalletCredentialState extends State<_WalletCredential> {
  final _password = TextEditingController();
  bool _closed = false;
  @override
  void initState() {
    super.initState();
    unawaited(widget.challenge.cancelled.then((_) => _close(null)));
  }

  void _close(Uint8List? value) {
    if (_closed || !mounted) {
      value?.fillRange(0, value.length, 0);
      return;
    }
    _closed = true;
    _password.clear();
    final route = ModalRoute.of(context);
    if (route != null && route.isActive) {
      Navigator.of(context).removeRoute(route, value);
    }
  }

  @override
  void dispose() {
    _closed = true;
    _password.clear();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close(null);
      },
      child: AlertDialog(
        title: Text(text.walletCredential),
        content: TextField(
          key: const ValueKey('wallet-credential'),
          controller: _password,
          obscureText: true,
          autofocus: true,
          autocorrect: false,
          enableSuggestions: false,
          enableIMEPersonalizedLearning: false,
          decoration: InputDecoration(labelText: text.walletPassword),
        ),
        actions: [
          TextButton(
            onPressed: () => _close(null),
            child: Text(text.walletCancel),
          ),
          FilledButton(
            onPressed: () =>
                _close(Uint8List.fromList(utf8.encode(_password.text))),
            child: Text(text.walletContinue),
          ),
        ],
      ),
    );
  }
}
