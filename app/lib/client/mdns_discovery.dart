import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart';

/// 广播和本机保存使用同一份厂家公开身份，均须经过完整格式检查。
final class FactoryHost {
  FactoryHost.fromJson(Map<String, Object?> json)
    : instanceId = json['instance_id'] as String,
      hostname = json['hostname'] as String,
      httpsPort = json['https_port'] as int,
      certificateSha256 = json['certificate_sha256'] as String,
      addresses = List.unmodifiable(
        (json['addresses'] as List).cast<String>(),
      ) {
    if (json['product_id'] != 'tuyufactory' ||
        json['protocol'] != 'TUYU/1' ||
        !RegExp(
          r'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$',
        ).hasMatch(instanceId) ||
        hostname != 'tuyufactory-$instanceId.local' ||
        httpsPort != 59460 ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(certificateSha256) ||
        addresses.isEmpty ||
        addresses.length > 16 ||
        addresses.toSet().length != addresses.length ||
        !addresses.every(isLanAddress)) {
      throw const FormatException('Invalid factory identity');
    }
  }

  final String instanceId;
  final String hostname;
  final int httpsPort;
  final String certificateSha256;
  final List<String> addresses;

  Uri get statusUri => Uri(
    scheme: 'https',
    host: hostname,
    port: httpsPort,
    path: '/tuyu/status',
  );

  Map<String, Object?> toJson() => {
    'product_id': 'tuyufactory',
    'protocol': 'TUYU/1',
    'instance_id': instanceId,
    'hostname': hostname,
    'https_port': httpsPort,
    'certificate_sha256': certificateSha256,
    'addresses': addresses,
  };

  bool sameIdentity(FactoryHost other) =>
      instanceId == other.instanceId &&
      hostname == other.hostname &&
      httpsPort == other.httpsPort &&
      certificateSha256 == other.certificateSha256;

  static bool isLanAddress(String value) {
    final address = InternetAddress.tryParse(value);
    if (address == null ||
        address.type != InternetAddressType.IPv4 ||
        address.address != value) {
      return false;
    }
    final bytes = address.rawAddress;
    return bytes[0] == 10 ||
        (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
        (bytes[0] == 192 && bytes[1] == 168) ||
        (bytes[0] == 169 && bytes[1] == 254);
  }
}

class MdnsDiscovery {
  static const service = '_tuyufactory._tcp.local';
  static const _channel = MethodChannel('tuyufactory/discovery');
  RawDatagramSocket? _socket;
  Completer<void>? _waiting;
  bool _closed = false;

  Future<List<FactoryHost>> discover({
    Duration timeout = const Duration(seconds: 3),
  }) async {
    if (_closed || _waiting != null) throw StateError('Discovery unavailable');
    final waiting = _waiting = Completer<void>();
    StreamSubscription<RawSocketEvent>? subscription;
    Timer? timer;
    var multicastLock = false;
    final hosts = <String, FactoryHost>{};
    Object? failure;
    try {
      if (Platform.isAndroid) {
        await _channel.invokeMethod<void>('acquireMulticastLock');
        multicastLock = true;
      }
      if (_closed) throw StateError('Discovery closed');
      final socket = await RawDatagramSocket.bind(
        InternetAddress.anyIPv4,
        5353,
        reuseAddress: true,
        reusePort: !Platform.isWindows,
      );
      _socket = socket;
      if (_closed) throw StateError('Discovery closed');
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
      );
      final multicast = InternetAddress('224.0.0.251');
      var joined = 0;
      for (final interface in interfaces) {
        if (!interface.addresses.any(
          (address) => FactoryHost.isLanAddress(address.address),
        )) {
          continue;
        }
        socket.joinMulticast(multicast, interface);
        joined++;
      }
      if (joined == 0) throw const SocketException('No LAN interface');
      subscription = socket.listen(
        (event) {
          if (event != RawSocketEvent.read) return;
          Datagram? datagram;
          for (
            var received = 0;
            received < 64 && (datagram = socket.receive()) != null;
            received++
          ) {
            final packet = datagram!;
            if (packet.port != 5353) continue;
            for (final host in parse(packet.data, packet.address.address)) {
              final existing = hosts[host.instanceId];
              // 同实例出现冲突证书或地址也不能用最后一个广播覆盖前者。
              if (existing != null &&
                  (!existing.sameIdentity(host) ||
                      jsonEncode(existing.addresses) !=
                          jsonEncode(host.addresses))) {
                failure = const FormatException(
                  'Conflicting factory advertisements',
                );
              }
              hosts[host.instanceId] = host;
              if (hosts.length > 32) {
                failure = const FormatException('Too many factories');
              }
            }
            if (failure != null) {
              if (!waiting.isCompleted) waiting.complete();
              break;
            }
          }
        },
        onError: (Object error) {
          failure = error;
          if (!waiting.isCompleted) waiting.complete();
        },
      );
      // 在每个已加入的接口查询，不能只依赖默认路由或跨网段广播。
      for (final interface in interfaces) {
        if (!interface.addresses.any(
          (address) => FactoryHost.isLanAddress(address.address),
        )) {
          continue;
        }
        final address = interface.addresses.firstWhere(
          (address) => FactoryHost.isLanAddress(address.address),
        );
        socket.setRawOption(
          RawSocketOption(
            RawSocketOption.levelIPv4,
            RawSocketOption.IPv4MulticastInterface,
            address.rawAddress,
          ),
        );
        socket.send(query(), multicast, 5353);
      }
      timer = Timer(timeout, () {
        if (!waiting.isCompleted) waiting.complete();
      });
      await waiting.future;
      if (_closed) throw StateError('Discovery closed');
      if (failure != null) throw failure!;
      return List.unmodifiable(hosts.values);
    } finally {
      timer?.cancel();
      await subscription?.cancel();
      _socket?.close();
      _socket = null;
      _waiting = null;
      if (multicastLock) {
        await _channel.invokeMethod<void>('releaseMulticastLock');
      }
    }
  }

  void close() {
    _closed = true;
    _socket?.close();
    final waiting = _waiting;
    if (waiting != null && !waiting.isCompleted) waiting.complete();
  }

  static Uint8List query() {
    final bytes = BytesBuilder()..add([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    for (final label in service.split('.')) {
      bytes.addByte(label.length);
      bytes.add(ascii.encode(label));
    }
    bytes.add([0, 0, 12, 0, 1]);
    return bytes.takeBytes();
  }

  /// 只消费厂家网关的完整公告；畸形、告别或未关联到同一实例的记录不形成候选。
  static List<FactoryHost> parse(Uint8List bytes, String sourceAddress) {
    try {
      if (bytes.length < 12 ||
          bytes.length > 16384 ||
          !FactoryHost.isLanAddress(sourceAddress)) {
        return [];
      }
      final reader = _DnsReader(bytes);
      if ((reader.u16(2) & 0x820f) != 0x8000) return [];
      final count = reader.u16(6) + reader.u16(8) + reader.u16(10);
      if (count > 128 || reader.u16(4) > 16) return [];
      var offset = 12;
      for (var i = 0; i < reader.u16(4); i++) {
        offset = reader.name(offset).$2 + 4;
      }
      final records = <({String owner, int type, int start, int end})>[];
      for (var i = 0; i < count; i++) {
        final (owner, next) = reader.name(offset);
        final type = reader.u16(next);
        final start = next + 10;
        final end = start + reader.u16(next + 8);
        if (end > bytes.length) return [];
        if ((reader.u16(next + 2) & 0x7fff) == 1 && reader.u32(next + 4) > 0) {
          records.add((owner: owner, type: type, start: start, end: end));
        }
        offset = end;
      }
      final hosts = <FactoryHost>[];
      for (final pointer in records.where(
        (r) => r.type == 12 && r.owner == service,
      )) {
        final (instance, end) = reader.name(pointer.start);
        if (end != pointer.end) continue;
        final services = records
            .where((r) => r.type == 33 && r.owner == instance)
            .toList();
        final texts = records
            .where((r) => r.type == 16 && r.owner == instance)
            .toList();
        if (services.length != 1 || texts.length != 1) continue;
        final srv = services.single;
        if (srv.end - srv.start < 7) continue;
        final (hostname, srvEnd) = reader.name(srv.start + 6);
        if (srvEnd != srv.end) continue;
        final txt = <String, String>{};
        var cursor = texts.single.start;
        while (cursor < texts.single.end) {
          final length = bytes[cursor++];
          if (cursor + length > texts.single.end) {
            throw const FormatException('TXT length');
          }
          final item = utf8.decode(bytes.sublist(cursor, cursor + length));
          cursor += length;
          final separator = item.indexOf('=');
          if (separator <= 0 || txt.containsKey(item.substring(0, separator))) {
            throw const FormatException('TXT key');
          }
          txt[item.substring(0, separator)] = item.substring(separator + 1);
        }
        final addresses =
            records
                .where(
                  (r) =>
                      r.type == 1 &&
                      r.owner == hostname &&
                      r.end - r.start == 4,
                )
                .map((r) => bytes.sublist(r.start, r.end).join('.'))
                .toSet()
                .toList()
              ..sort();
        if (!addresses.contains(sourceAddress) ||
            txt['https_port'] != '${reader.u16(srv.start + 4)}') {
          continue;
        }
        final host = FactoryHost.fromJson({
          ...txt,
          'hostname': hostname,
          'https_port': reader.u16(srv.start + 4),
          'addresses': addresses,
        });
        if (instance != 'tuyufactory-${host.instanceId}.$service') continue;
        hosts.add(host);
      }
      return hosts;
    } on Object {
      return [];
    }
  }
}

final class _DnsReader {
  _DnsReader(this.bytes);
  final Uint8List bytes;
  int u16(int offset) => ByteData.sublistView(bytes).getUint16(offset);
  int u32(int offset) => ByteData.sublistView(bytes).getUint32(offset);
  (String, int) name(int start) {
    final labels = <String>[];
    final visited = <int>{};
    var cursor = start;
    int? next;
    var size = 0;
    while (true) {
      if (!visited.add(cursor) || visited.length > 128) {
        throw const FormatException('DNS pointer');
      }
      final length = bytes[cursor++];
      if (length == 0) return (labels.join('.').toLowerCase(), next ?? cursor);
      if ((length & 0xc0) == 0xc0) {
        next ??= cursor + 1;
        cursor = ((length & 0x3f) << 8) | bytes[cursor];
        continue;
      }
      size += length + 1;
      if (length > 63 || size > 255) throw const FormatException('DNS label');
      labels.add(ascii.decode(bytes.sublist(cursor, cursor + length)));
      cursor += length;
    }
  }
}
