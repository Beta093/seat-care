// Exercises the real Dart client against the local Node API, with simulated input.
// Refuses non-loopback servers. Never uploads to a deployed sensor room.
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'package:seat_care_worker/services/sharing.dart';
import 'package:seat_care_worker/domain/sensor.dart';

Future<void> main(List<String> args) async {
  final config = jsonDecode(await File(args.single).readAsString());
  final worker = ShareInvite.parse(config['workerInvite'], allowLocal: true);
  if (worker.endpoint.host != '127.0.0.1') {
    throw StateError('Local verification only');
  }
  final admin = Uri.parse(config['adminInvite']);
  final token = Uri.splitQueryString(admin.fragment)['key']!;
  final client = SharingClient();
  final now = DateTime.now().millisecondsSinceEpoch;
  final session = const Uuid().v4(), event = const Uuid().v4();
  final values = SensorPacket.parse('P:350,2800,400,2700,600')!.values;
  final payload = {
    'action': 'upload',
    'version': 1,
    'requestId': const Uuid().v4(),
    'snapshot': {
      'source': 'sensor',
      'layoutId': layoutId,
      'sessionId': session,
      'sequence': 1,
      'at': now,
      'quality': 'seated',
      'connected': true,
      'device': 'LOCAL-TEST-ESP32',
      'values': values,
      'baseline': [650, 650, 650, 650, 550],
      'bias': ['R1', 'R2'],
    },
    'events': [
      {
        'id': event,
        'sessionId': session,
        'source': 'sensor',
        'type': 'help_requested',
        'at': now,
        'detail': '로컬 통합 시험용 도움 요청 (실물 측정 아님)',
      },
    ],
  };
  await client.request(worker, payload);
  await client.request(worker, payload);
  final response = await http.get(
    worker.endpoint,
    headers: {'Authorization': 'Bearer $token'},
  );
  final data = jsonDecode(response.body);
  if (response.statusCode != 200 ||
      data['state']['snapshot']['values'][1] != 2800 ||
      data['state']['events'].where((e) => e['id'] == event).length != 1) {
    throw StateError('Admin did not receive deduplicated sensor frame');
  }
  final ack = await http.post(
    worker.endpoint,
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({'action': 'acknowledge', 'eventId': event}),
  );
  if (ack.statusCode != 200) throw StateError('Admin acknowledgement failed');
  final back = await client.request(worker);
  if (back['state']['acknowledgements'][event] == null) {
    throw StateError('Worker did not receive admin acknowledgement');
  }
  client.close();
  stdout.writeln(
    'PASS: Dart sensor parser → HTTP upload → admin read → admin acknowledgement → Dart read; retry deduplication verified. Local simulated input only.',
  );
}
