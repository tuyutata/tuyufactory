import 'dart:async';
import 'package:flutter/material.dart';
import 'package:tuyufactory/host/employee_access_controller.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';

class EmployeeAccessPage extends StatefulWidget {
  const EmployeeAccessPage({required this.controller, super.key});
  final EmployeeAccessController controller;

  @override
  State<EmployeeAccessPage> createState() => _EmployeeAccessPageState();
}

class _EmployeeAccessPageState extends State<EmployeeAccessPage> {
  final _response = TextEditingController();
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    unawaited(widget.controller.refresh());
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      // 签名期间保留挑战；定期回读进程状态，避免页面永久显示旧的运行结果。
      if (widget.controller.challenge == null) {
        unawaited(widget.controller.refresh());
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _response.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.controller,
    builder: (context, _) {
      final controller = widget.controller;
      final value = controller.snapshot;
      final text = AppLocalizations.of(context);
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text.employeeAccess,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                value == null
                    ? text.gatewayUnknown
                    : value.enabled
                    ? text.gatewayEnabled
                    : text.gatewayDisabled,
              ),
              if (value != null) ...[
                SelectableText('${text.instanceId}: ${value.instanceId}'),
                if (value.enabled) ...[
                  SelectableText(
                    'https://${value.hostname}:${value.httpsPort}',
                  ),
                  for (final address in value.addresses)
                    SelectableText('https://$address:${value.httpsPort}'),
                ],
                if (value.certificateSha256 != null)
                  SelectableText(
                    '${text.certificateSha256}: ${value.certificateSha256}',
                  ),
                if (!value.realtimeAvailable) Text(text.realtimeUnavailable),
                if (value.error != null) Text(value.error!),
              ],
              if (controller.error != null) Text(controller.error!),
              const SizedBox(height: 12),
              if (value != null && value.authenticated)
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    FilledButton(
                      onPressed: controller.busy || value.enabled
                          ? null
                          : controller.enable,
                      child: Text(text.enableGateway),
                    ),
                    OutlinedButton(
                      onPressed: controller.busy || !value.enabled
                          ? null
                          : controller.disable,
                      child: Text(text.disableGateway),
                    ),
                  ],
                )
              else ...[
                Text(text.administratorLoginRequired),
                OutlinedButton(
                  onPressed: controller.busy
                      ? null
                      : controller.createChallenge,
                  child: Text(text.createChallenge),
                ),
                if (controller.challenge != null) ...[
                  SelectableText(controller.challenge!),
                  TextField(
                    controller: _response,
                    decoration: InputDecoration(
                      labelText: text.administratorResponse,
                    ),
                  ),
                  FilledButton(
                    onPressed: controller.busy
                        ? null
                        : () async {
                            final response = _response.text;
                            _response.clear();
                            await controller.login(response);
                          },
                    child: Text(text.administratorLogin),
                  ),
                ],
              ],
              TextButton(
                onPressed: controller.busy ? null : controller.refresh,
                child: Text(text.refreshGateway),
              ),
            ],
          ),
        ),
      );
    },
  );
}
