import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:seat_care_worker/worker_controller.dart';
import 'package:seat_care_worker/services/local_store.dart';
import 'package:seat_care_worker/services/sharing.dart';

class MemoryStore extends LocalStore {
  Map<String, dynamic> saved = {};
  @override
  Future<Map<String, dynamic>> load() async => saved;
  @override
  Future<void> save(Map<String, dynamic> state) async {
    saved = jsonDecode(jsonEncode(state));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  test(
    'sharing starts at opt-in, preserves failed outbox and removes only acknowledged records',
    () async {
      var failing = true;
      final store = MemoryStore();
      final client = SharingClient(
        client: MockClient((request) async {
          if (failing) {
            return http.Response(jsonEncode({'error': 'offline'}), 503);
          }
          final payload = jsonDecode(request.body);
          return http.Response(
            jsonEncode({
              'role': 'worker',
              'room': 'test-room-12345678',
              'acceptedIds': (payload['events'] as List)
                  .map((e) => e['id'])
                  .toList(),
              'state': {'acknowledgements': {}},
            }),
            200,
          );
        }),
      );
      final c = WorkerController(store: store, sharing: client);
      await c.initialize();
      c.record('help_requested', c.now, 'local before consent');
      c.invite = ShareInvite(
        Uri.parse('https://example.com/api/telemetry'),
        'test-token',
        'test-room-12345678',
      );
      await c.setSharing(true);
      expect(c.pendingIds.length, 1);
      expect(c.syncMessage, contains('offline'));
      expect(store.saved['pendingIds'], hasLength(1));
      c.record('help_requested', c.now, 'shared after consent');
      await c.persist();
      expect(c.pendingIds.length, 2);
      failing = false;
      await c.sync();
      expect(c.pendingIds, isEmpty);
      expect(c.lastSyncAt, greaterThan(0));
      failing = true;
      c.record('help_requested', c.now, 'pending then stopped');
      await c.setSharing(false);
      expect(c.pendingIds, isEmpty);
      expect(
        c.events.any((e) => e['detail'] == 'pending then stopped'),
        isTrue,
      );
      c.dispose();
    },
  );
  test(
    'calibration blocks controls until terminal status and reconnect invalidates baseline',
    () {
      final c = WorkerController();
      c.connection(true, 'ESP32:AABBCC');
      c.receive('S:ZERO_CALIBRATING');
      expect(c.commandPending, isTrue);
      c.receive('S:BALANCE_REQUIRED');
      expect(c.commandPending, isFalse);
      c.receive('S:READY');
      c.receive('P:650,650,650,650,550');
      expect(c.usable, isTrue);
      c.care.baseline = [650, 650, 650, 650, 550];
      c.connection(false, '');
      expect(c.care.baseline, isNull);
      expect(c.usable, isFalse);
      c.dispose();
    },
  );
}
