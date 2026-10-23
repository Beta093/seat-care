// Protocol/geometry adapted from br4c3/esp32_telecommunication, MIT.
// See THIRD_PARTY_LICENSE.txt. These are relative loads, never mmHg.
import 'dart:math' as math;

const channelIds = ['L1', 'R1', 'L2', 'R2', 'C1'];
const channelLabels = ['왼쪽 앞', '오른쪽 앞', '왼쪽 뒤', '오른쪽 뒤', '중앙 뒤'];
const channelPositions = [
  (0.30, 0.30),
  (0.70, 0.30),
  (0.325, 0.675),
  (0.675, 0.675),
  (0.50, 0.85),
];
const layoutId = 'seat-care-drawing-20261007-v2';
const serviceId = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const rxId = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const txId = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

String? deviceCode(String value) => RegExp(
  r'^(?:ESP32[:\-]P?[:\-]?)?([0-9A-F]{6})$',
).firstMatch(value.trim().toUpperCase())?.group(1);

class SensorPacket {
  const SensorPacket({this.values, this.status, this.warnings = const []});
  final List<double>? values;
  final String? status;
  final List<int> warnings;
  static SensorPacket? parse(String input) {
    final text = input.trim();
    if (text.startsWith('P:')) {
      final parts = text.substring(2).split(',');
      if (parts.length != 5 ||
          parts.any((p) => !RegExp(r'^\d+(?:\.\d+)?$').hasMatch(p.trim()))) {
        return null;
      }
      final values = parts.map((p) => double.parse(p.trim())).toList();
      if (values.any((v) => !v.isFinite || v < 0 || v > 65535)) return null;
      return SensorPacket(values: values);
    }
    final match = RegExp(
      r'^S:(SETUP_REQUIRED|ZERO_REQUIRED|ZERO_CALIBRATING|CALIBRATING|BALANCE_REQUIRED|BALANCE_CALIBRATING|READY|ZERO_FAILED|CALIBRATION_FAILED|ZERO_WARNING|BALANCE_WARNING)(?::([1-5](?:,[1-5])*))?$',
    ).firstMatch(text);
    return match == null
        ? null
        : SensorPacket(
            status: match[1],
            warnings: match[2]?.split(',').map(int.parse).toList() ?? [],
          );
  }
}

double pressureAt(List<double> values, double x, double y) {
  var remaining = 1.0;
  for (var i = 0; i < 5; i++) {
    final p = channelPositions[i];
    final distance = math.sqrt(math.pow(x - p.$1, 2) + math.pow(y - p.$2, 2));
    final influence = distance >= .48
        ? 0
        : .5 * (1 + math.cos(math.pi * distance / .48));
    remaining *= 1 - (values[i] / 3200).clamp(0, 1) * influence;
  }
  return (1 - remaining) * 3200;
}
