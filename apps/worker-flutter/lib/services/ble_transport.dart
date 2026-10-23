import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_reactive_ble/flutter_reactive_ble.dart';
import 'package:permission_handler/permission_handler.dart';
import '../domain/sensor.dart';

class BleTransport {
  BleTransport({
    required this.onPacket,
    required this.onConnection,
    required this.onError,
  });
  final void Function(String) onPacket;
  final void Function(bool, String) onConnection;
  final void Function(String) onError;
  late final FlutterReactiveBle _ble = FlutterReactiveBle();
  StreamSubscription<ConnectionStateUpdate>? _connection;
  StreamSubscription<List<int>>? _notifications;
  QualifiedCharacteristic? _rx;
  int _generation = 0;

  Future<void> requestPermissions() async {
    if (Platform.isAndroid) {
      final version = (await DeviceInfoPlugin().androidInfo).version.sdkInt;
      final permissions = version >= 31
          ? [Permission.bluetoothScan, Permission.bluetoothConnect]
          : [Permission.locationWhenInUse];
      final granted = await permissions.request();
      if (granted.values.any((s) => !s.isGranted)) {
        throw StateError('Bluetooth 권한을 허용해 주세요. 이전 Android에서는 위치 권한도 필요해요.');
      }
    }
    // iOS Core Bluetooth requests permission when scanning starts.
  }

  Stream<DiscoveredDevice> scan() => _ble.scanForDevices(
    withServices: [Uuid.parse(serviceId)],
    scanMode: ScanMode.lowLatency,
  );
  Future<void> connect(DiscoveredDevice device) async {
    await disconnect(notify: false);
    final generation = ++_generation;
    _connection = _ble
        .connectToDevice(
          id: device.id,
          connectionTimeout: const Duration(seconds: 15),
        )
        .listen(
          (event) async {
            if (generation != _generation) return;
            if (event.connectionState == DeviceConnectionState.disconnected) {
              _rx = null;
              await _notifications?.cancel();
              if (generation == _generation) onConnection(false, device.name);
            }
            if (event.connectionState != DeviceConnectionState.connected) {
              return;
            }
            try {
              if (Platform.isAndroid) {
                await _ble.requestMtu(deviceId: device.id, mtu: 64);
              }
              if (generation != _generation) return;
              _rx = QualifiedCharacteristic(
                serviceId: Uuid.parse(serviceId),
                characteristicId: Uuid.parse(rxId),
                deviceId: device.id,
              );
              final tx = QualifiedCharacteristic(
                serviceId: Uuid.parse(serviceId),
                characteristicId: Uuid.parse(txId),
                deviceId: device.id,
              );
              _notifications = _ble
                  .subscribeToCharacteristic(tx)
                  .listen(
                    (bytes) {
                      if (generation == _generation) {
                        onPacket(utf8.decode(bytes, allowMalformed: true));
                      }
                    },
                    onError: (Object error) {
                      if (generation == _generation) {
                        onError('센서 수신이 중단됐어요. 다시 연결해 주세요.');
                        unawaited(disconnect());
                      }
                    },
                  );
              onConnection(true, device.name.isEmpty ? 'ESP32' : device.name);
              // Notify setup is asynchronous in reactive_ble 5.x. Repeat the idempotent
              // status request so a first response before CCCD setup is not lost.
              await command('GET_CALIBRATION_STATUS');
              await Future<void>.delayed(const Duration(milliseconds: 700));
              if (generation == _generation) {
                await command('GET_CALIBRATION_STATUS');
              }
            } catch (_) {
              if (generation == _generation) {
                onError('BLE 채널을 열지 못했어요. 기기 전원과 연결을 확인해 주세요.');
                await disconnect();
              }
            }
          },
          onError: (Object error) {
            if (generation == _generation) {
              onError('방석 연결에 실패했어요. Bluetooth와 기기 전원을 확인해 주세요.');
              unawaited(disconnect());
            }
          },
        );
  }

  Future<void> command(String value) async {
    if (![
      'GET_CALIBRATION_STATUS',
      'CALIBRATE_ZERO',
      'CALIBRATE_BALANCE',
      'CONTINUE_ZERO_CALIBRATION',
      'CONTINUE_BALANCE_CALIBRATION',
    ].contains(value)) {
      throw StateError('지원하지 않는 명령이에요.');
    }
    final rx = _rx;
    if (rx == null) throw StateError('방석을 먼저 연결해 주세요.');
    await _ble
        .writeCharacteristicWithResponse(rx, value: utf8.encode(value))
        .timeout(const Duration(seconds: 8));
  }

  Future<void> disconnect({bool notify = true}) async {
    ++_generation;
    _rx = null;
    await _notifications?.cancel();
    _notifications = null;
    await _connection?.cancel();
    _connection = null;
    if (notify) onConnection(false, '');
  }
}
