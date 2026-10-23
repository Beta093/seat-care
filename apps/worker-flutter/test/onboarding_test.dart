import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seat_care_worker/domain/sensor.dart';
import 'package:seat_care_worker/main.dart';
import 'package:seat_care_worker/worker_controller.dart';
import 'support/setup_fakes.dart';

Future<void> reveal(WidgetTester tester, Finder target) async {
  await tester.scrollUntilVisible(
    target,
    180,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pump();
  await Scrollable.ensureVisible(tester.element(target), alignment: .5);
  await tester.pump(const Duration(milliseconds: 200));
  final position = tester
      .state<ScrollableState>(find.byType(Scrollable).first)
      .position;
  for (var i = 0; i < 30 && position.isScrollingNotifier.value; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test(
    'label codes accept firmware formats and reject unrelated QR payloads',
    () {
      for (final value in ['a1b2c3', 'ESP32:A1B2C3', 'ESP32-P-A1B2C3']) {
        expect(deviceCode(value), 'A1B2C3');
      }
      for (final value in [
        '',
        '123',
        'ZZZZZZ',
        'https://example.com/A1B2C3',
        'A1B2C3 extra',
      ]) {
        expect(deviceCode(value), isNull);
      }
    },
  );

  test(
    'completion waits for firmware READY and is restored on next launch',
    () async {
      final store = SetupStore();
      final ble = SetupTransport();
      final c = WorkerController(store: store, transport: ble);
      await c.initialize();
      expect(c.setupCompleted, isFalse);
      c.connection(true, 'ESP32-P-A1B2C3');
      c.receive('S:SETUP_REQUIRED');
      await c.command('CALIBRATE_ZERO');
      expect(ble.sent, ['CALIBRATE_ZERO']);
      expect(await c.completeSetup(), isFalse);
      c.receive('S:BALANCE_REQUIRED');
      await c.command('CALIBRATE_BALANCE');
      expect(await c.completeSetup(), isFalse);
      c.receive('S:READY');
      expect(await c.completeSetup(), isTrue);
      expect(store.saved['setupCompleted'], isTrue);
      c.dispose();
      final next = WorkerController(store: store, transport: SetupTransport());
      await next.initialize();
      expect(next.setupCompleted, isTrue);
      expect(next.connected, isFalse);
      next.dispose();
    },
  );

  test(
    'warning continuation sends firmware command without enabling automatic assessment',
    () async {
      final ble = SetupTransport();
      final c = WorkerController(transport: ble);
      c.connection(true, 'ESP32-P-A1B2C3');
      c.receive('S:ZERO_WARNING:1,4');
      await c.command('CONTINUE_BALANCE_CALIBRATION');
      expect(ble.sent, isEmpty);
      await c.command('CONTINUE_ZERO_CALIBRATION');
      expect(c.status, 'ZERO_WARNING');
      expect(c.commandPending, isTrue);
      c.receive('S:BALANCE_REQUIRED');
      await c.command('CALIBRATE_BALANCE');
      c.receive('S:BALANCE_WARNING:1');
      await c.command('CONTINUE_BALANCE_CALIBRATION');
      expect(c.status, 'BALANCE_WARNING');
      c.receive('S:READY');
      c.receive('P:0,400,500,600,700');
      expect(c.displayValues, [0, 400, 500, 600, 700]);
      expect(c.usable, isFalse);
      expect(c.care.baseline, isNull);
      expect(c.care.alert, isNull);
      expect(c.snapshot()['quality'], 'unavailable');
      ble.fail = true;
      await c.command('CALIBRATE_ZERO');
      expect(c.calibrationLimited, isTrue);
      expect(c.status, 'READY');
      c.connection(false, '');
      expect(c.displayValues, isNull);
      c.dispose();
    },
  );

  test('failed storage does not mark setup as completed', () async {
    final store = SetupStore();
    final c = WorkerController(store: store, transport: SetupTransport());
    await c.initialize();
    c.connection(true, 'ESP32-P-A1B2C3');
    c.receive('S:READY');
    store.fail = true;
    expect(await c.completeSetup(), isFalse);
    expect(c.setupCompleted, isFalse);
    expect(c.storageError, isNotEmpty);
    c.dispose();
  });

  testWidgets(
    'first-run flow, retry, disconnect and icon-only home work with large text',
    (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = WorkerController(
        store: SetupStore(),
        transport: SetupTransport(),
      )..initialized = true;
      await tester.pumpWidget(SeatCareApp(controller: c));
      await tester.pumpAndSettle();
      expect(find.text('방석을 연결해 주세요'), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      await tester.tap(find.text('큰 글씨'));
      await tester.pumpAndSettle();
      Future<void> tapText(String label) async {
        final finder = find.text(label);
        await reveal(tester, finder);
        await tester.tap(finder);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }

      await tapText('내 방석 연결하기');
      c.connection(true, 'ESP32-P-A1B2C3');
      c.receive('S:SETUP_REQUIRED');
      await tester.pumpAndSettle();
      await tapText('빈 방석 측정하기');
      await tester.pump(const Duration(seconds: 6));
      expect(c.status, 'ZERO_CALIBRATING');
      expect(c.setupCompleted, isFalse);
      c.receive('S:ZERO_WARNING:2');
      await tester.pumpAndSettle();
      await reveal(tester, find.textContaining('R1 · 오른쪽 앞'));
      expect(find.textContaining('R1 · 오른쪽 앞'), findsOneWidget);
      await tapText('다시 측정');
      c.receive('S:BALANCE_REQUIRED');
      await tester.pumpAndSettle();
      expect(find.text('편안하게 앉아 주세요'), findsOneWidget);
      c.connection(false, '');
      await tester.pumpAndSettle();
      expect(find.text('기기 연결'), findsOneWidget);
      expect(find.text('내 시트 시작하기'), findsNothing);
      c.connection(true, 'ESP32-P-A1B2C3');
      c.receive('S:BALANCE_REQUIRED');
      await tester.pumpAndSettle();
      await tapText('앉은 자세 측정하기');
      c.receive('S:READY');
      await tester.pumpAndSettle();
      await tapText('내 시트 시작하기');
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byIcon(Icons.home_rounded), findsOneWidget);
      expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).labelBehavior,
        NavigationDestinationLabelBehavior.alwaysHide,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );

  testWidgets(
    'manual code validates and filters nearby devices before selecting',
    (tester) async {
      final ble = SetupTransport();
      final c = WorkerController(transport: ble)..setupCompleted = false;
      await tester.pumpWidget(SeatCareApp(controller: c));
      await tester.pumpAndSettle();
      await reveal(tester, find.text('내 방석 연결하기'));
      await tester.tap(find.text('내 방석 연결하기'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'bad');
      await reveal(tester, find.text('주변 방석 찾기'));
      await tester.tap(find.text('주변 방석 찾기'));
      await tester.pumpAndSettle();
      expect(find.textContaining('6자리'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'A1B2C3');
      await tester.tap(find.text('주변 방석 찾기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('ESP32-P-A1B2C3'), findsOneWidget);
      expect(find.text('ESP32-P-D4E5F6'), findsNothing);
      await reveal(tester, find.text('ESP32-P-A1B2C3'));
      expect(tester.widget<ListTile>(find.byType(ListTile)).onTap, isNotNull);
      await tester.tap(find.byType(ListTile));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(c.error, isEmpty);
      expect(c.foreground, isTrue);
      expect(c.scanning, isFalse);
      expect(ble.selectedId, 'ESP32-P-A1B2C3');
      expect(c.setupCompleted, isFalse);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
}
