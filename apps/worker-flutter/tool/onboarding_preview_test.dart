// Optional visual QA on a host with a Korean font. No sensor/server is contacted.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seat_care_worker/main.dart';
import 'package:seat_care_worker/worker_controller.dart';
import '../test/support/setup_fakes.dart';

void main() {
  const fontPath = String.fromEnvironment('SEAT_PREVIEW_FONT');
  const output = String.fromEnvironment('SEAT_PREVIEW_DIR');
  testWidgets('capture onboarding stages with simulated firmware responses', (
    tester,
  ) async {
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
    final c = WorkerController(store: SetupStore(), transport: SetupTransport())
      ..initialized = true;
    final key = GlobalKey();
    await tester.pumpWidget(
      RepaintBoundary(
        key: key,
        child: SeatCareApp(controller: c),
      ),
    );
    await tester.runAsync(
      () => precacheImage(
        const AssetImage('assets/images/cushion.png'),
        tester.element(find.byType(Scaffold).first),
      ),
    );
    Future<void> capture(String name) async {
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final boundary =
          key.currentContext!.findRenderObject() as RenderRepaintBoundary;
      await tester.runAsync(() async {
        await Directory(output).create(recursive: true);
        final image = await boundary.toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File(
          '$output/$name.png',
        ).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }

    await capture('01-welcome');
    await tester.scrollUntilVisible(
      find.text('내 방석 연결하기'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('내 방석 연결하기'));
    await capture('02-connect');
    c.connection(true, 'ESP32-P-A1B2C3');
    c.receive('S:SETUP_REQUIRED');
    await capture('03-empty-seat');
    c.receive('S:ZERO_CALIBRATING');
    c.calibrationStartedAt = c.now - 2000;
    await capture('04-measuring');
    c.receive('S:ZERO_WARNING:2');
    await capture('05-warning');
    c.receive('S:BALANCE_REQUIRED');
    await capture('06-seated');
    c.receive('S:READY');
    await capture('07-ready');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
