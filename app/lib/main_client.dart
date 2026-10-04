import 'package:flutter/widgets.dart';
import 'package:tuyufactory/client/app.dart';

void main() {
  // 分机独立装配，不创建厂家主机运行时，也不按运行时参数切换角色。
  runApp(const ClientApp());
}
