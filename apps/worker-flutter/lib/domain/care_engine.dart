import 'sensor.dart';

/// Foreground care rules ported from packages/shared/src/care-session.js.
/// Thresholds are engineering defaults; hardware/clinical validation is pending.
class CareEngine {
  CareEngine({required this.onEvent});
  final void Function(String type, int at, String detail) onEvent;
  List<double>? values, baseline;
  int? lastAt;
  String quality = 'unavailable', message = '방석을 연결해 주세요.';
  bool layoutConfirmed = false, alertsEnabled = true;
  List<List<double>>? capture;
  int captureStart = 0, captureElapsed = 0;
  final Map<int, int> candidates = {};
  final Set<int> bias = {};
  final Map<int, double> completed = {};
  int? reliefIndex;
  double reference = 0;
  int heldMs = 0;
  int? badAt;
  bool previousGood = false, reliefComplete = false;
  int noReliefMs = 0, lastAlert = -60000, snoozeUntil = 0;
  String? alert;

  bool fresh(int at) => lastAt != null && at >= lastAt! && at - lastAt! < 1500;
  void stopRelief(String reason, int at) {
    if (reliefIndex != null && !reliefComplete) {
      onEvent(
        'relief_interrupted',
        at,
        '${channelIds[reliefIndex!]} · $reason · 유효 유지 ${heldMs ~/ 1000}초',
      );
    }
    reliefIndex = null;
    heldMs = 0;
    previousGood = false;
    badAt = null;
    reliefComplete = false;
  }

  void interrupt(String reason, int at, {bool invalidate = false}) {
    if (capture != null) onEvent('baseline_failed', at, reason);
    if (lastAt != null) onEvent('data_lost', at, reason);
    capture = null;
    captureElapsed = 0;
    stopRelief(reason, at);
    candidates.clear();
    bias.clear();
    alert = null;
    values = null;
    lastAt = null;
    quality = 'unavailable';
    message = reason;
    if (invalidate) {
      baseline = null;
      completed.clear();
      noReliefMs = 0;
      layoutConfirmed = false;
    }
  }

  void tick(int at) {
    if (lastAt != null && !fresh(at)) {
      interrupt('센서 수신이 끊겼어요. 연결을 확인해 주세요.', at);
    }
  }

  void startBaseline(int at) {
    if (!layoutConfirmed) throw StateError('실물 센서의 순서와 위치를 먼저 확인해 주세요.');
    if (quality != 'seated' || !fresh(at)) throw StateError('최근 착석 데이터가 필요해요.');
    stopRelief('개인 기준 재등록', at);
    baseline = null;
    capture = [];
    captureElapsed = 0;
    candidates.clear();
    bias.clear();
    completed.clear();
    alert = null;
    noReliefMs = 0;
    message = '평소 편안한 자세를 10초 동안 유지해 주세요.';
  }

  void beginRelief(int index, int at) {
    if (baseline == null || quality != 'seated' || !fresh(at)) {
      throw StateError('개인 기준과 최근 센서값이 필요해요.');
    }
    if (reliefIndex != null && !reliefComplete) {
      throw StateError('진행 중인 확인을 먼저 취소해 주세요.');
    }
    if (completed.containsKey(index)) throw StateError('같은 감소 구간은 이미 기록했어요.');
    if (values![index] < 20) throw StateError('비교할 부하가 부족해요.');
    reliefIndex = index;
    reference = values![index];
    heldMs = 0;
    badAt = null;
    previousGood = false;
    reliefComplete = false;
    onEvent(
      'relief_armed',
      at,
      '${channelIds[index]} · 부하 30% 감소를 20초 유지하면 기록해요.',
    );
  }

  void acknowledge(int at) {
    if (alert != null) onEvent('alert_acknowledged', at, alert!);
    alert = null;
  }

  void sample(List<double> sample, int at) {
    if (sample.length != 5 ||
        sample.any((v) => !v.isFinite || v < 0 || v >= 65535)) {
      interrupt('유효하지 않은 센서값이에요.', at);
      return;
    }
    if (lastAt != null && at <= lastAt!) {
      interrupt('수신 시각이 중복되거나 역전됐어요.', at);
      return;
    }
    if (lastAt != null && at - lastAt! > 1500) {
      interrupt('수신 공백으로 연속 확인을 중단했어요.', at);
    }
    final dt = lastAt == null ? 0 : at - lastAt!;
    final wasSeated = quality == 'seated';
    lastAt = at;
    values = List.of(sample);
    if (sample.reduce((a, b) => a + b) < 125) {
      if (capture != null) onEvent('baseline_failed', at, '기준 등록 중 좌면 부하 해제');
      capture = null;
      stopRelief('좌면 부하 해제 · 원인 미확인', at);
      quality = 'unloaded';
      message = '좌면 부하가 감지되지 않아요. 원인은 확인할 수 없어요.';
      candidates.clear();
      bias.clear();
      alert = null;
      noReliefMs = 0;
      return;
    }
    if (sample.any((v) => v == 0)) {
      interrupt('반응이 없는 센서가 있어요. 접촉을 확인해 주세요.', at);
      return;
    }
    quality = 'seated';
    if (capture != null) {
      if (sample.any((v) => v < 20)) {
        capture = null;
        message = '센서 반응이 부족해요. 다시 등록해 주세요.';
        onEvent('baseline_failed', at, message);
        return;
      }
      if (capture!.isEmpty) captureStart = at;
      capture!.add(List.of(sample));
      captureElapsed = at - captureStart;
      if (captureElapsed >= 10000) {
        final frames = capture!;
        final means = List.generate(
          5,
          (i) => frames.fold<double>(0, (s, f) => s + f[i]) / frames.length,
        );
        final unstable =
            frames.length < 10 ||
            List.generate(5, (i) {
              final channel = frames.map((f) => f[i]).toList()..sort();
              return (channel.last - channel.first) / means[i] > .20;
            }).any((v) => v);
        capture = null;
        if (unstable) {
          message = '압력 변화가 컸어요. 편안하게 앉아 다시 등록해 주세요.';
          onEvent('baseline_failed', at, message);
        } else {
          baseline = means;
          message = '개인 착석 기준이 등록됐어요.';
          onEvent(
            'baseline_registered',
            at,
            '10초 안정 착석 · ${means.map((v) => v.round()).join(", ")}',
          );
        }
      }
      return;
    }
    if (baseline == null) {
      message = '개인 착석 기준을 등록해 주세요.';
      return;
    }
    message = '개인 기준에 가까운 압력 분포예요.';
    noReliefMs += wasSeated ? dt : 0;
    for (var i = 0; i < 5; i++) {
      if (completed.containsKey(i) && sample[i] >= completed[i]! * .9) {
        completed.remove(i);
      }
      final delta = sample[i] / baseline![i] - 1;
      if (delta >= .30) {
        candidates.putIfAbsent(i, () => at);
        if (at - candidates[i]! >= 10000) bias.add(i);
      } else if (delta <= .20) {
        candidates.remove(i);
        bias.remove(i);
      } else if (!bias.contains(i)) {
        candidates.remove(i);
      }
    }
    if (bias.isNotEmpty) {
      message =
          '${bias.map((i) => channelLabels[i]).join(", ")} 부하가 개인 기준보다 높게 이어지고 있어요.';
    }
    if (reliefIndex != null && !reliefComplete) {
      final good = sample[reliefIndex!] <= reference * .70;
      if (good) {
        if (badAt != null && at - badAt! > 500) {
          heldMs = 0;
          previousGood = false;
          onEvent('relief_interrupted', at, '부하 재증가로 유지시간 초기화');
        }
        if (previousGood) heldMs += dt;
        previousGood = true;
        badAt = null;
        if (heldMs >= 20000) {
          reliefComplete = true;
          completed[reliefIndex!] = reference;
          noReliefMs = 0;
          alert = null;
          onEvent(
            'relief_completed',
            at,
            '${channelIds[reliefIndex!]} · 30% 이상 부하 감소 · 유효 유지 ${heldMs ~/ 1000}초',
          );
        }
      } else {
        previousGood = false;
        if (heldMs > 0) {
          badAt ??= at;
          if (at - badAt! >= 500) {
            heldMs = 0;
            badAt = null;
            onEvent('relief_interrupted', at, '부하가 다시 증가해 유지시간 초기화');
          }
        }
      }
    }
    if (bias.isEmpty && noReliefMs < 1800000) alert = null;
    if ((bias.isNotEmpty || noReliefMs >= 1800000) &&
        alertsEnabled &&
        at >= snoozeUntil &&
        at - lastAlert >= 60000) {
      lastAlert = at;
      alert = bias.isNotEmpty ? message : '30분 동안 압력 완화를 확인하지 못했어요.';
      onEvent('alert_created', at, alert!);
    }
  }
}
