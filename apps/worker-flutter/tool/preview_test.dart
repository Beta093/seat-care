// Optional visual QA on a host with a Korean font. No sensor/server is contacted.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seat_care_worker/main.dart';
import 'package:seat_care_worker/worker_controller.dart';

void main() {
  const fontPath = String.fromEnvironment('SEAT_PREVIEW_FONT');
  const output = String.fromEnvironment('SEAT_PREVIEW_OUTPUT');
  testWidgets(
    'capture Flutter worker screen using explicitly simulated input',
    (tester) async {
      if (fontPath.isEmpty || output.isEmpty) return;
      await tester.runAsync(() async {
        final font = FontLoader('Roboto')
          ..addFont(
            Future.value(
              ByteData.sublistView(await File(fontPath).readAsBytes()),
            ),
          );
        await font.load();
        final icons = FontLoader('MaterialIcons')
          ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
        await icons.load();
        final fallback = FontLoader('Ahem')
          ..addFont(
            Future.value(
              ByteData.sublistView(await File(fontPath).readAsBytes()),
            ),
          );
        await fallback.load();
      });
      tester.view.physicalSize = const Size(420, 920);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = WorkerController()..setupCompleted = true;
      c.connected = true;
      c.status = 'READY';
      c.device = '화면 검증 · 모의 입력';
      c.care.baseline = [650, 650, 650, 650, 550];
      c.care.sample([620, 780, 640, 720, 550], c.now);
      final key = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: SeatCareApp(controller: c),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final boundary =
          key.currentContext!.findRenderObject() as RenderRepaintBoundary;
      await tester.runAsync(() async {
        final image = await boundary.toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File(output).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
}
