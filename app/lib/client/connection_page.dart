import 'dart:async';

import 'package:citizen_sdk/citizen_sdk.dart';
import 'package:flutter/material.dart';
import 'package:tuyufactory/client/host_connection.dart';
import 'package:tuyufactory/shared/product.dart';
import 'package:tuyufactory/client/web.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';
import 'package:tuyufactory/shared/l10n/app_localizations_en.dart';
import 'package:tuyufactory/shared/l10n/app_localizations_zh.dart';

class ConnectionPage extends StatefulWidget {
  const ConnectionPage({
    required this.connection,
    required this.sdk,
    required this.capabilities,
    required this.walletState,
    required this.sdkStarting,
    required this.sdkError,
    required this.onRetrySdk,
    required this.onWalletReady,
    super.key,
  });

  final CitizenSdk? sdk;
  final HostConnection connection;
  final CitizenCapabilitySnapshot? capabilities;
  final CitizenWalletState? walletState;
  final bool sdkStarting;
  final String? sdkError;
  final Future<void> Function() onRetrySdk;
  final Future<void> Function() onWalletReady;

  @override
  State<ConnectionPage> createState() => _ConnectionPageState();
}

final class _ConnectionPageState extends State<ConnectionPage> {
  late final FactoryWeb _web;

  @override
  void initState() {
    super.initState();
    _web = FactoryWeb(widget.connection);
  }

  @override
  void dispose() {
    if (!_walletGone.isCompleted) _walletGone.complete();
    _web.dispose();
    super.dispose();
  }

  Completer<void> _walletGone = Completer<void>();
  bool _walletOperationRunning = false;
  bool _readFailed = false;
  String? _walletError;

  @override
  void didUpdateWidget(ConnectionPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(widget.sdk, oldWidget.sdk)) {
      _walletGone.complete();
      _walletGone = Completer<void>();
      _walletError = null;
      _readFailed = false;
      _walletOperationRunning = false;
    }
  }

  Future<void> _runWalletOperation(WalletAction? action) async {
    final sdk = widget.sdk;
    if (_walletOperationRunning || sdk == null || widget.sdkStarting) return;
    setState(() {
      _walletOperationRunning = true;
      _walletError = null;
    });
    try {
      if (action != null) {
        final committed = await showWalletDialog(
          context,
          sdk,
          action,
          _walletGone.future,
        );
        if (!mounted || !identical(sdk, widget.sdk) || !committed) return;
      }
      _readFailed = true;
      await widget.onWalletReady();
      if (mounted && identical(sdk, widget.sdk)) _readFailed = false;
    } on Object {
      if (mounted && identical(sdk, widget.sdk)) {
        setState(
          () =>
              _walletError = AppLocalizations.of(context).walletOperationFailed,
        );
      }
    } finally {
      if (mounted && identical(sdk, widget.sdk)) {
        setState(() => _walletOperationRunning = false);
      }
    }
  }

  Widget _bilingual(String zh, String en, {bool heading = false}) {
    final chinese = Localizations.localeOf(context).languageCode == 'zh';
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          chinese ? zh : en,
          textAlign: TextAlign.center,
          style: heading
              ? Theme.of(context).textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w700)
              : null,
        ),
        const SizedBox(height: 2),
        Text(
          chinese ? en : zh,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  Widget _walletEntry() {
    final zh = AppLocalizationsZh();
    final en = AppLocalizationsEn();
    final available =
        widget.sdk != null &&
        widget.capabilities != null &&
        widget.sdkError == null;
    final busy = widget.sdkStarting;
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFEAF3EF), Color(0xFFF8FAF8)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Center(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(20),
                              child: Image.asset(
                                'tuyu_logo.png',
                                width: 96,
                                height: 96,
                                fit: BoxFit.contain,
                                excludeFromSemantics: true,
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          _bilingual(zh.appTitle, en.appTitle, heading: true),
                          const SizedBox(height: 20),
                          _bilingual(zh.walletTitle, en.walletTitle),
                          const SizedBox(height: 12),
                          _bilingual(zh.walletSubtitle, en.walletSubtitle),
                          const SizedBox(height: 24),
                          if (busy)
                            const Center(child: CircularProgressIndicator())
                          else if (!available) ...[
                            _bilingual(
                              zh.citizenSdkUnavailable,
                              en.citizenSdkUnavailable,
                            ),
                            const SizedBox(height: 12),
                            FilledButton(
                              key: const ValueKey('retry-citizen-sdk'),
                              onPressed: widget.onRetrySdk,
                              child: _bilingual(
                                zh.citizenSdkRetry,
                                en.citizenSdkRetry,
                              ),
                            ),
                          ] else if (walletBlocked(widget.walletState) ||
                              _readFailed ||
                              widget.walletState == null) ...[
                            Text(
                              _readFailed || widget.walletState == null
                                  ? AppLocalizations.of(context)
                                        .walletOperationFailed
                                  : AppLocalizations.of(context)
                                        .walletRecovering,
                            ),
                            TextButton(
                              onPressed: _walletOperationRunning
                                  ? null
                                  : () => _runWalletOperation(null),
                              child: Text(zh.citizenSdkRetry),
                            ),
                          ] else ...[
                            if (_walletError != null) ...[
                              _bilingual(
                                zh.walletOperationFailed,
                                en.walletOperationFailed,
                              ),
                              const SizedBox(height: 12),
                            ],
                            FilledButton(
                              key: const ValueKey('create-wallet'),
                              onPressed: () =>
                                  _runWalletOperation(WalletAction.create),
                              child: _bilingual(
                                zh.walletCreate,
                                en.walletCreate,
                              ),
                            ),
                            const SizedBox(height: 12),
                            OutlinedButton(
                              key: const ValueKey('import-wallet'),
                              onPressed: () => _runWalletOperation(
                                WalletAction.importWallet,
                              ),
                              child: _bilingual(
                                zh.walletImport,
                                en.walletImport,
                              ),
                            ),
                            TextButton(
                              key: const ValueKey('retry-wallet-check'),
                              onPressed: _walletOperationRunning
                                  ? null
                                  : () => _runWalletOperation(null),
                              child: Text(zh.citizenSdkRetry),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final localizations = AppLocalizations.of(context);
    if (!walletReady(widget.walletState) || widget.sdkStarting) {
      return _walletEntry();
    }
    return Scaffold(
      appBar: AppBar(title: Text(localizations.appTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              localizations.clientTitle,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
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
                    if (widget.sdkStarting)
                      Text(localizations.citizenSdkStarting)
                    else if (widget.sdk == null ||
                        widget.capabilities == null) ...[
                      Text(localizations.citizenSdkUnavailable),
                      if (widget.sdkError != null) ...[
                        const SizedBox(height: 8),
                        Text(localizations.citizenSdkUnavailable),
                      ],
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: widget.onRetrySdk,
                        child: Text(localizations.citizenSdkRetry),
                      ),
                    ] else ...[
                      Text(localizations.citizenSdkReady),
                      if (widget.capabilities case final capabilities?)
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
                          OutlinedButton(
                            onPressed: _walletOperationRunning
                                ? null
                                : () => _runWalletOperation(WalletAction.add),

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
            // ERPNext 员工界面仍由主机上游系统提供，本步骤不重写业务页。
            ListenableBuilder(
              listenable: widget.connection,
              builder: (context, child) {
                final connection = widget.connection;
                final host = connection.host;
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          localizations.hostConnection,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(switch (connection.status) {
                          HostConnectionStatus.idle => localizations.hostIdle,
                          HostConnectionStatus.discovering =>
                            localizations.hostDiscovering,
                          HostConnectionStatus.awaitingTrust =>
                            localizations.hostTrust,
                          HostConnectionStatus.connecting =>
                            localizations.hostConnecting,
                          HostConnectionStatus.ready => localizations.hostReady,
                          HostConnectionStatus.failed =>
                            localizations.hostFailed,
                        }),
                        if (connection.status == HostConnectionStatus.failed &&
                            connection.failure != null)
                          Text(switch (connection.failure!) {
                            HostConnectionFailure.storage =>
                              localizations.hostStorageFailed,
                            HostConnectionFailure.discovery =>
                              localizations.hostDiscoveryFailed,
                            HostConnectionFailure.noHost =>
                              localizations.hostNotFound,
                            HostConnectionFailure.multipleHosts =>
                              localizations.hostMultiple,
                            HostConnectionFailure.verification =>
                              localizations.hostVerificationFailed,
                          }),
                        if (host != null) ...[
                          const SizedBox(height: 8),
                          SelectableText(host.statusUri.origin),
                          SelectableText(host.addresses.join(', ')),
                          SelectableText(
                            '${localizations.instanceId}: ${host.instanceId}',
                          ),
                          Text(localizations.certificateSha256),
                          SelectableText(host.certificateSha256),
                        ],
                        const SizedBox(height: 12),
                        if (connection.status ==
                            HostConnectionStatus.awaitingTrust)
                          Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: [
                              FilledButton(
                                onPressed: connection.busy
                                    ? null
                                    : connection.trust,
                                child: Text(localizations.hostConfirm),
                              ),
                              OutlinedButton(
                                onPressed: connection.busy
                                    ? null
                                    : connection.cancelTrust,
                                child: Text(localizations.hostCancel),
                              ),
                            ],
                          )
                        else
                          OutlinedButton(
                            onPressed: connection.busy
                                ? null
                                : connection.start,
                            child: Text(localizations.hostRetry),
                          ),
                        if (connection.status ==
                            HostConnectionStatus.ready) ...[
                          const SizedBox(height: 8),
                          ListenableBuilder(
                            listenable: _web,
                            builder: (context, child) => Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                FilledButton(
                                  onPressed: _web.opening || _web.opened
                                      ? null
                                      : _web.open,
                                  child: Text(localizations.openWorkspace),
                                ),
                                if (_web.opening)
                                  const LinearProgressIndicator(),
                                if (_web.failed)
                                  Text(localizations.workspaceFailed),
                              ],
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(localizations.realtimeUnavailable),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 16),
            Text(localizations.clientUnavailable),
          ],
        ),
      ),
    );
  }
}
