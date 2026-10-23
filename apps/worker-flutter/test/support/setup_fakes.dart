import 'dart:convert';
import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_reactive_ble/flutter_reactive_ble.dart';
import 'package:seat_care_worker/services/ble_transport.dart';
import 'package:seat_care_worker/services/local_store.dart';

class SetupStore extends LocalStore {
  Map<String, dynamic> saved = {};
  bool fail = false;
  @override
  Future<Map<String, dynamic>> load() async => saved;
  @override
  Future<void> save(Map<String, dynamic> state) async {
    if (fail) throw StateError('disk full');
    saved = jsonDecode(jsonEncode(state));
  }
}

class SetupTransport extends BleTransport {
  SetupTransport()
    : super(onPacket: (_) {}, onConnection: (_, _) {}, onError: (_) {});
  final sent = <String>[];
  bool fail = false;
  String? selectedId;
  final nearby = [device('ESP32-P-A1B2C3'), device('ESP32-P-D4E5F6')];
  static DiscoveredDevice device(String name) => DiscoveredDevice(
    id: name,
    name: name,
    serviceData: {},
    manufacturerData: Uint8List(0),
    rssi: -52,
    serviceUuids: [],
  );
  @override
  Future<void> requestPermissions() async {}
  @override
  Stream<DiscoveredDevice> scan() {
    late final StreamController<DiscoveredDevice> stream;
    stream = StreamController<DiscoveredDevice>(
      onListen: () {
        for (final device in nearby) {
          stream.add(device);
        }
      },
      onCancel: () async {},
    );
    return stream.stream;
  }

  @override
  Future<void> connect(DiscoveredDevice device) async {
    selectedId = device.id;
  }

  @override
  Future<void> command(String value) async {
    if (fail) throw StateError('write failed');
    sent.add(value);
  }

  @override
  Future<void> disconnect({bool notify = true}) async {}
}
