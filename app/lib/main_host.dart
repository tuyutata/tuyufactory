import 'package:flutter/widgets.dart';
import 'package:tuyufactory/host/app.dart';
import 'package:tuyufactory/host/app_scope.dart';

void main() {
  // 编译期主机入口负责创建本机运行时；分机入口不引用本文件。
  runApp(const TuyuFactoryScope(child: TuyuFactoryApp()));
}
