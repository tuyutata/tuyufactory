import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tuyufactory/client/app.dart';

void main() {
  testWidgets('分机可独立装配，不需要主机原生库或运行模型', (tester) async {
    await tester.pumpWidget(
      const ClientApp(
        locale: Locale('zh'),
        startCitizenSdk: false,
        connectHost: false,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(ClientApp), findsOneWidget);
    expect(find.byType(Scaffold), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(
      find.widgetWithText(FilledButton, '重新启动 CitizenSDK'),
      findsOneWidget,
    );
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });

  for (final (locale, title, status) in [
    (const Locale('zh'), '厂家分机', '尚未连接厂家主机。'),
    (
      const Locale('en'),
      'Factory client',
      'The factory host is not connected yet.',
    ),
    (const Locale('fr'), '厂家分机', '尚未连接厂家主机。'),
  ]) {
    for (final size in [const Size(320, 568), const Size(1024, 768)]) {
      testWidgets('分机明确展示未接入状态且没有主机或员工操作：$locale $size', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          ClientApp(locale: locale, startCitizenSdk: false, connectHost: false),
        );
        await tester.pumpAndSettle();
        expect(find.text(title), findsOneWidget);
        expect(find.textContaining(status), findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        expect(
          find.widgetWithText(FilledButton, '重新启动 CitizenSDK'),
          locale.languageCode == 'en' ? findsNothing : findsOneWidget,
        );
        if (locale.languageCode == 'en') {
          expect(
            find.widgetWithText(FilledButton, 'Restart CitizenSDK'),
            findsOneWidget,
          );
        }
        expect(find.text('重新启动'), findsNothing);
        expect(find.text('初始化途遇厂家端管理员'), findsNothing);
        expect(find.textContaining('厂家本地系统已经就绪'), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
