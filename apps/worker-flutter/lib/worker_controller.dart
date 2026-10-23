import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_reactive_ble/flutter_reactive_ble.dart'
    show DiscoveredDevice;
import 'package:uuid/uuid.dart';
import 'domain/care_engine.dart';
import 'domain/sensor.dart';
import 'services/ble_transport.dart';
import 'services/local_store.dart';
import 'services/sharing.dart';

const eventLabels = {
  'session_started': '측정 연결',
  'baseline_registered': '개인 기준 등록',
  'baseline_failed': '기준 등록 중단',
  'alert_created': '압력 완화 안내',
  'alert_acknowledged': '사용자 안내 확인',
  'relief_armed': '완화 확인 준비',
  'relief_completed': '완화 조건 충족',
  'relief_interrupted': '완화 확인 중단',
  'data_lost': '관측 공백',
  'help_requested': '도움 요청',
  'sharing_started': '관리자 공유 시작',
  'sharing_stopped': '관리자 공유 중지',
};

class WorkerController extends ChangeNotifier {
  WorkerController({
    LocalStore? store,
    SharingClient? sharing,
    BleTransport? transport,
  }) : store = store ?? LocalStore(),
       sharing = sharing ?? SharingClient() {
    care = CareEngine(onEvent: record);
    ble =
        transport ??
        BleTransport(
          onPacket: receive,
          onConnection: connection,
          onError: (message) {
            error = message;
            notifyListeners();
          },
        );
  }
  final LocalStore store;
  final SharingClient sharing;
  final secure = const FlutterSecureStorage();
  final uuid = const Uuid();
  late final CareEngine care;
  late final BleTransport ble;
  Timer? _tick, _sync, _scanTimeout, _statusTimeout;
  StreamSubscription<DiscoveredDevice>? _scan;
  final Map<String, DiscoveredDevice> devices = {};
  List<Map<String, dynamic>> events = [];
  Set<String> pendingIds = {};
  Map<String, dynamic> acknowledgements = {};
  ShareInvite? invite;
  String sessionId = const Uuid().v4(),
      device = '',
      status = 'disconnected',
      error = '',
      storageError = '',
      syncMessage = '공유 꺼짐';
  int sequence = 0, lastSyncAt = 0;
  int? calibrationStartedAt, rawAt;
  List<double>? rawValues;
  bool setupCompleted = false, calibrationLimited = false;
  bool connected = false,
      scanning = false,
      connecting = false,
      initialized = false,
      disposed = false,
      foreground = true,
      sharingEnabled = false,
      syncing = false,
      commandPending = false,
      largeText = false;
  List<int> warnings = [];
  int get now => DateTime.now().millisecondsSinceEpoch;
  bool get usable =>
      connected && status == 'READY' && !calibrationLimited && care.fresh(now);
  List<double>? get displayValues => calibrationLimited
      ? connected && status == 'READY' && rawAt != null && now - rawAt! < 1500
            ? rawValues
            : null
      : usable
      ? care.values
      : null;

  Future<void> initialize() async {
    try {
      final data = await store.load();
      events = (data['events'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      pendingIds = (data['pendingIds'] as List? ?? []).cast<String>().toSet();
      largeText = data['largeText'] == true;
      setupCompleted = data['setupCompleted'] == true;
      final link = await secure.read(key: 'workerInvite');
      if (link != null) {
        invite = ShareInvite.parse(link, allowLocal: kDebugMode);
        // The room key prevents a restored outbox from crossing a changed invitation.
        if (data['room'] == invite!.room) {
          sharingEnabled = data['sharingEnabled'] == true;
        } else {
          pendingIds.clear();
          sharingEnabled = false;
        }
      } else {
        pendingIds.clear();
      }
    } catch (_) {
      storageError = '이전 기록 또는 공유 설정을 읽지 못했어요. 기록 파일을 확인해 주세요.';
      sharingEnabled = false;
    }
    initialized = true;
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!foreground) return;
      care.tick(now);
      notifyListeners();
    });
    _sync = Timer.periodic(const Duration(seconds: 5), (_) => sync());
    syncMessage = sharingEnabled ? '전송 준비 중' : '공유 꺼짐';
    notifyListeners();
  }

  Future<void> persist() async {
    if (!initialized) return;
    final cutoff = now - const Duration(days: 90).inMilliseconds;
    events = events.where((e) => (e['at'] as int) >= cutoff).toList();
    if (events.length > 2000) {
      events = events.sublist(events.length - 2000);
    }
    pendingIds.retainAll(events.map((e) => e['id'] as String));
    try {
      await store.save({
        'events': events,
        'pendingIds': pendingIds.toList(),
        'room': invite?.room,
        'sharingEnabled': sharingEnabled,
        'largeText': largeText,
        'setupCompleted': setupCompleted,
      });
      storageError = '';
    } catch (_) {
      storageError = '기기에 기록을 저장하지 못했어요. 앱을 닫기 전에 기록을 확인해 주세요.';
    }
    if (!disposed) notifyListeners();
  }

  Future<bool> completeSetup() async {
    if (!initialized || !connected || status != 'READY' || commandPending) {
      return false;
    }
    setupCompleted = true;
    await persist();
    if (storageError.isNotEmpty) {
      setupCompleted = false;
      notifyListeners();
      return false;
    }
    return true;
  }

  void record(String type, int at, String detail) {
    final event = <String, dynamic>{
      'id': uuid.v4(),
      'sessionId': sessionId,
      'source': 'sensor',
      'type': type,
      'at': at,
      'detail': detail,
    };
    events.add(event);
    if (sharingEnabled && invite != null) pendingIds.add(event['id'] as String);
    unawaited(persist());
  }

  void connection(bool value, String name) {
    if (disposed) return;
    _statusTimeout?.cancel();
    final wasConnected = connected;
    connected = value;
    connecting = false;
    commandPending = false;
    calibrationStartedAt = null;
    rawValues = null;
    rawAt = null;
    if (value) {
      calibrationLimited = false;
      device = name;
      status = 'checking';
      sessionId = uuid.v4();
      sequence = 0;
      care.interrupt('개인 기준을 다시 등록해 주세요.', now, invalidate: true);
      record('session_started', now, '$device · 센서 연결');
      _statusTimeout = Timer(const Duration(seconds: 8), () {
        if (status == 'checking') {
          error = '보정 상태 응답이 없어요. 상태 다시 읽기를 눌러 주세요.';
          notifyListeners();
        }
      });
    } else {
      status = 'disconnected';
      if (wasConnected) {
        care.interrupt('방석 연결이 끊겨 측정을 중단했어요.', now, invalidate: true);
      }
    }
    notifyListeners();
  }

  void receive(String text) {
    if (!foreground || !connected || disposed) return;
    final packet = SensorPacket.parse(text);
    if (packet == null) {
      if (text.trim().startsWith('P:')) care.interrupt('센서 패킷이 잘못됐어요.', now);
      return;
    }
    if (packet.status != null) {
      error = '';
      _statusTimeout?.cancel();
      commandPending = [
        'ZERO_CALIBRATING',
        'BALANCE_CALIBRATING',
        'CALIBRATING',
      ].contains(packet.status);
      if (commandPending) armStatusTimeout();
      if (commandPending && calibrationStartedAt == null) {
        calibrationStartedAt = now;
      }
      if (!commandPending) calibrationStartedAt = null;
      if (status != packet.status && packet.status != 'READY') {
        care.interrupt('기기 보정 중에는 측정하지 않아요.', now, invalidate: true);
      }
      status = packet.status!;
      warnings = packet.warnings;
      notifyListeners();
    } else if (status == 'READY') {
      if (calibrationLimited) {
        rawValues = packet.values;
        rawAt = now;
        care.message = '센서 경고가 있어 값만 확인하고 있어요. 다시 보정해 주세요.';
      } else {
        care.sample(packet.values!, now);
      }
    }
  }

  Future<void> startScan() async {
    if (scanning || connecting || connected) return;
    try {
      error = '';
      await ble.requestPermissions();
      if (!foreground || disposed) return;
      devices.clear();
      scanning = true;
      notifyListeners();
      _scan = ble.scan().listen(
        (d) {
          devices[d.id] = d;
          notifyListeners();
        },
        onError: (Object e) {
          error = '검색하지 못했어요. Bluetooth·권한·위치 설정을 확인해 주세요.';
          unawaited(stopScan());
        },
      );
      _scanTimeout = Timer(const Duration(seconds: 12), () {
        unawaited(stopScan());
      });
    } catch (e) {
      error = cleanError(e);
      notifyListeners();
    }
  }

  Future<void> stopScan() async {
    _scanTimeout?.cancel();
    await _scan?.cancel();
    _scan = null;
    scanning = false;
    if (!disposed) notifyListeners();
  }

  Future<void> connect(DiscoveredDevice d) async {
    await stopScan();
    if (!foreground || disposed) return;
    error = '';
    connecting = true;
    notifyListeners();
    try {
      await ble.connect(d);
    } catch (e) {
      error = cleanError(e);
      connecting = false;
      notifyListeners();
    }
  }

  Future<void> command(String value) async {
    if (commandPending || !connected || !foreground || disposed) return;
    final continuation = value.startsWith('CONTINUE_');
    if (continuation &&
        !((value == 'CONTINUE_ZERO_CALIBRATION' && status == 'ZERO_WARNING') ||
            (value == 'CONTINUE_BALANCE_CALIBRATION' &&
                status == 'BALANCE_WARNING'))) {
      return;
    }
    final previousStatus = status;
    final previousLimited = calibrationLimited;
    commandPending = true;
    error = '';
    if (value != 'GET_CALIBRATION_STATUS') {
      care.interrupt('기기 보정으로 개인 기준을 다시 등록해야 해요.', now, invalidate: true);
      rawValues = null;
      rawAt = null;
      if (continuation) {
        calibrationLimited = true;
      } else {
        if (value == 'CALIBRATE_ZERO') calibrationLimited = false;
        status = value == 'CALIBRATE_ZERO'
            ? 'ZERO_CALIBRATING'
            : 'BALANCE_CALIBRATING';
        calibrationStartedAt = now;
      }
    }
    notifyListeners();
    try {
      await ble.command(value);
      if (commandPending) armStatusTimeout();
    } catch (e) {
      commandPending = false;
      status = previousStatus;
      calibrationLimited = previousLimited;
      calibrationStartedAt = null;
      error = cleanError(e);
      notifyListeners();
    }
  }

  void armStatusTimeout() {
    _statusTimeout?.cancel();
    _statusTimeout = Timer(const Duration(seconds: 12), () {
      commandPending = false;
      calibrationStartedAt = null;
      error = '보정 응답을 기다리고 있어요. 상태 다시 읽기로 확인해 주세요.';
      notifyListeners();
    });
  }

  void run(void Function() action) {
    try {
      error = '';
      action();
    } catch (e) {
      error = cleanError(e);
    }
    notifyListeners();
  }

  Future<void> configureSharing(String link) async {
    if (syncing || sharingEnabled) {
      throw StateError('먼저 공유를 끄고 전송이 끝난 뒤 변경해 주세요.');
    }
    final parsed = ShareInvite.parse(link, allowLocal: kDebugMode);
    await sharing.request(
      parsed,
    ); // Verify signature/role on server before saving.
    await secure.write(key: 'workerInvite', value: link.trim());
    if (invite?.room != parsed.room) {
      pendingIds.clear();
      acknowledgements.clear();
    }
    invite = parsed;
    syncMessage = '연결 확인 완료 · 공유를 켜면 이후 기록을 전송해요.';
    await persist();
  }

  Future<void> setSharing(bool enabled) async {
    if (syncing) return;
    if (enabled && invite == null) throw StateError('사용자용 공유 초대를 먼저 연결해 주세요.');
    sharingEnabled = enabled;
    if (enabled) {
      record('sharing_started', now, '5초 간격 센서 상태와 이후 수행·도움 기록 공유');
    } else {
      pendingIds.clear();
      record('sharing_stopped', now, '새 전송 중지 · 서버에 보낸 기록은 유지');
    }
    syncMessage = enabled ? '전송 준비 중' : '공유 꺼짐 · 기존 서버 기록은 유지돼요.';
    await persist();
    if (enabled) await sync();
  }

  Map<String, dynamic> snapshot() => {
    'source': 'sensor',
    'layoutId': layoutId,
    'sessionId': sessionId,
    'sequence': ++sequence,
    'at': care.lastAt ?? now,
    'quality': usable ? care.quality : 'unavailable',
    'connected': connected && foreground,
    'device': device,
    'values': usable ? care.values : null,
    'baseline': care.baseline,
    'bias': care.bias.map((i) => channelIds[i]).toList(),
  };
  Future<void> sync() async {
    if (!initialized ||
        !sharingEnabled ||
        invite == null ||
        syncing ||
        !foreground ||
        disposed) {
      return;
    }
    syncing = true;
    final current = invite!;
    final batch = events
        .where((e) => pendingIds.contains(e['id']))
        .take(50)
        .toList();
    try {
      final result = await sharing.request(current, {
        'action': 'upload',
        'version': 1,
        'requestId': uuid.v4(),
        'snapshot': snapshot(),
        'events': batch,
      });
      if (disposed) return;
      pendingIds.removeAll((result['acceptedIds'] as List).cast<String>());
      acknowledgements = Map<String, dynamic>.from(
        result['state']['acknowledgements'] ?? {},
      );
      lastSyncAt = now;
      syncMessage =
          '서버 전송 완료${pendingIds.isNotEmpty ? " · 남은 기록 ${pendingIds.length}개" : ""}';
      await persist();
    } catch (e) {
      if (!disposed) {
        syncMessage =
            '${cleanError(e)} · 미전송 ${pendingIds.length}개, 연결되면 재시도해요.';
      }
    } finally {
      syncing = false;
      if (!disposed) notifyListeners();
    }
  }

  Future<void> setForeground(bool value) async {
    if (foreground == value) return;
    foreground = value;
    if (!value) {
      await stopScan();
      care.interrupt(
        '화면을 떠나 측정을 중단했어요. 돌아오면 방석을 다시 연결해 주세요.',
        now,
        invalidate: true,
      );
      await ble.disconnect();
      await persist();
    }
    if (!disposed) notifyListeners();
  }

  void help() {
    record('help_requested', now, '사용자가 도움을 요청했어요.');
    notifyListeners();
    unawaited(sync());
  }

  void toggleText() {
    largeText = !largeText;
    unawaited(persist());
    notifyListeners();
  }

  @override
  void dispose() {
    disposed = true;
    _tick?.cancel();
    _sync?.cancel();
    _statusTimeout?.cancel();
    _scanTimeout?.cancel();
    _scan?.cancel();
    unawaited(ble.disconnect());
    sharing.close();
    super.dispose();
  }
}

String cleanError(Object e) => e.toString().replaceFirst(
  RegExp(r'^(Bad state: |FormatException: |Exception: )'),
  '',
);
