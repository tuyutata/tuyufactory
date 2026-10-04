import 'package:flutter/material.dart';
import 'package:tuyufactory/host/runtime_model.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';

class RuntimeStatusCard extends StatelessWidget {
  const RuntimeStatusCard({required this.component, super.key});

  final FactoryRuntimeComponent component;

  @override
  Widget build(BuildContext context) {
    final strings = AppLocalizations.of(context);
    final (icon, label) = switch (component.state) {
      FactoryComponentState.starting => (
        Icons.pending_actions_outlined,
        strings.starting,
      ),
      FactoryComponentState.ready => (
        Icons.check_circle_outline,
        strings.ready,
      ),
      FactoryComponentState.failed => (Icons.error_outline, strings.failed),
      FactoryComponentState.stopped => (
        Icons.stop_circle_outlined,
        strings.stopped,
      ),
    };
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(component.id),
        subtitle: Text(component.error ?? label),
      ),
    );
  }
}
