import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:tuyufactory/client/mdns_discovery.dart';

class HostStore {
  HostStore({Future<Directory> Function()? directory})
    : _directory = directory ?? getApplicationSupportDirectory;
  final Future<Directory> Function() _directory;

  Future<File> _file() async => File('${(await _directory()).path}/host.json');

  Future<FactoryHost?> load() async {
    final file = await _file();
    final type = await FileSystemEntity.type(file.path, followLinks: false);
    if (type == FileSystemEntityType.notFound) return null;
    if (type != FileSystemEntityType.file || await file.length() > 8192) {
      throw const FormatException('Invalid saved host');
    }
    final json = jsonDecode(await file.readAsString());
    // 损坏资料不是“首次安装”，禁止由发现结果覆盖既有信任。
    if (json is! Map<String, dynamic>) {
      throw const FormatException('Invalid saved host');
    }
    return FactoryHost.fromJson(json);
  }

  Future<void> save(FactoryHost host) async {
    final file = await _file();
    if (await FileSystemEntity.type(file.path, followLinks: false) !=
        FileSystemEntityType.notFound) {
      throw StateError('A fixed host already exists');
    }
    await file.parent.create(recursive: true);
    // 单个应用连接控制器串行提交；异常保留原信任，不提供自动覆盖入口。
    final temporary = File('${file.path}.tmp');
    await temporary.create(exclusive: true);
    try {
      await temporary.writeAsString(jsonEncode(host.toJson()), flush: true);
      if (await FileSystemEntity.type(file.path, followLinks: false) !=
          FileSystemEntityType.notFound) {
        throw StateError('A fixed host already exists');
      }
      await temporary.rename(file.path);
    } finally {
      if (await temporary.exists()) await temporary.delete();
    }
  }
}
