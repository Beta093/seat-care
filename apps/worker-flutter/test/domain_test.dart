import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:seat_care_worker/domain/care_engine.dart';
import 'package:seat_care_worker/domain/sensor.dart';
import 'package:seat_care_worker/services/sharing.dart';

void main() {
  test(
    'ESP32 protocol accepts five channels and calibration warnings only',
    () {
      expect(SensorPacket.parse('P:350,2800,400,2700,600')!.values, [
        350,
        2800,
        400,
        2700,
        600,
      ]);
      expect(SensorPacket.parse('S:ZERO_WARNING:1,5')!.warnings, [1, 5]);
      for (final bad in [
        'P:1,2,3,4',
        'P:1,2,3,4,NaN',
        'P:1,2,3,4,65536',
        'S:READY:6',
      ]) {
        expect(SensorPacket.parse(bad), isNull);
      }
    },
  );
  List<String> events = [];
  CareEngine prepared() {
    events = [];
    final c = CareEngine(onEvent: (type, at, detail) => events.add(type));
    c.sample([650, 650, 650, 650, 550], 1000);
    c.layoutConfirmed = true;
    c.startBaseline(1000);
    for (var at = 1100; at <= 11100; at += 100) {
      c.sample([650, 650, 650, 650, 550], at);
    }
    expect(c.baseline, isNotNull);
    return c;
  }

  test('baseline allows asymmetry but rejects gaps and unstable input', () {
    final c = prepared();
    c.startBaseline(11100);
    c.sample([650, 650, 650, 650, 550], 11200);
    c.sample([650, 650, 650, 650, 550], 14000);
    expect(c.capture, isNull);
    expect(c.baseline, isNull);
    expect(events, contains('baseline_failed'));
    c.startBaseline(14000);
    for (var at = 14100; at <= 24100; at += 100) {
      c.sample([at % 200 == 0 ? 1200 : 650, 650, 650, 650, 550], at);
    }
    expect(c.baseline, isNull);
  });
  test('acknowledging alert and arming relief never count as completion', () {
    final c = prepared();
    for (var at = 11200; at <= 21300; at += 100) {
      c.sample([1000, 650, 650, 650, 550], at);
    }
    expect(c.bias, contains(0));
    expect(c.alert, isNotNull);
    c.acknowledge(21300);
    c.beginRelief(0, 21300);
    expect(events.where((e) => e == 'relief_completed'), isEmpty);
  });
  test(
    '20 seconds of measured reduction completes once and cannot duplicate',
    () {
      final c = prepared();
      c.beginRelief(0, 11100);
      for (var at = 11200; at <= 32200; at += 100) {
        c.sample([400, 650, 650, 650, 550], at);
      }
      expect(c.reliefComplete, isTrue);
      expect(events.where((e) => e == 'relief_completed').length, 1);
      expect(() => c.beginRelief(0, 32200), throwsStateError);
      c.sample([650, 650, 650, 650, 550], 32300);
      c.beginRelief(0, 32300);
      expect(c.reliefComplete, isFalse);
    },
  );
  test(
    'unloading, stale input and foreground interruption cannot complete relief',
    () {
      final c = prepared();
      c.beginRelief(0, 11100);
      c.sample([400, 650, 650, 650, 550], 11200);
      c.tick(13000);
      expect(c.reliefIndex, isNull);
      expect(c.values, isNull);
      expect(events, contains('data_lost'));
      c.sample([650, 650, 650, 650, 550], 13100);
      c.beginRelief(0, 13100);
      c.sample([0, 0, 0, 0, 0], 13200);
      expect(c.quality, 'unloaded');
      expect(events.where((e) => e == 'relief_completed'), isEmpty);
      c.interrupt('background', 13300, invalidate: true);
      expect(c.baseline, isNull);
      expect(c.layoutConfirmed, isFalse);
    },
  );
  test('saturation or zero channel interrupts observation', () {
    final c = prepared();
    c.sample([65535, 650, 650, 650, 550], 11200);
    expect(c.quality, 'unavailable');
    c.sample([0, 650, 650, 650, 550], 11300);
    expect(c.quality, 'unavailable');
  });
  String invitation(
    String role, {
    String scheme = 'https',
    String host = 'example.com',
  }) {
    final payload = base64Url
        .encode(
          utf8.encode(
            jsonEncode({
              'v': 1,
              'room': 'test-room-12345678',
              'role': role,
              'exp': DateTime.now().millisecondsSinceEpoch + 60000,
            }),
          ),
        )
        .replaceAll('=', '');
    return '$scheme://$host/sensor/#key=$payload.signature';
  }

  test('invites reject admin role and insecure remote transport', () {
    expect(
      ShareInvite.parse(invitation('worker')).endpoint.toString(),
      'https://example.com/api/telemetry',
    );
    expect(() => ShareInvite.parse(invitation('admin')), throwsFormatException);
    expect(
      () => ShareInvite.parse(invitation('worker', scheme: 'http')),
      throwsFormatException,
    );
    expect(
      () => ShareInvite.parse(
        invitation('worker', scheme: 'http', host: 'localhost'),
      ),
      throwsFormatException,
    );
  });
  test(
    'API role mismatch and errors never count as successful sharing',
    () async {
      final invite = ShareInvite.parse(invitation('worker'));
      final client = SharingClient(
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer ${invite.token}');
          expect(request.followRedirects, isFalse);
          return http.Response(
            jsonEncode({'role': 'admin', 'room': invite.room}),
            200,
          );
        }),
      );
      await expectLater(client.request(invite), throwsStateError);
      client.close();
    },
  );
}
