import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seat_care_worker/main.dart';
import 'package:seat_care_worker/worker_controller.dart';

void main() {
  testWidgets(
    'worker navigation remains usable on a narrow screen with large text',
    (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = WorkerController()..setupCompleted = true;
      await tester.pumpWidget(SeatCareApp(controller: controller));
      await tester.pumpAndSettle();
      expect(find.text('방석 연결 대기'), findsOneWidget);
      await tester.tap(find.text('큰 글씨'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.tap(find.byIcon(Icons.settings_outlined));
      await tester.pumpAndSettle();
      expect(find.text('주변 방석 찾기'), findsOneWidget);
      expect(find.text('사용자 초대 링크 연결'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byIcon(Icons.history_rounded));
      await tester.pumpAndSettle();
      expect(find.text('완화 조건 충족 0회'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
}
