import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'domain/sensor.dart';
import 'worker_controller.dart';
import 'theme/palette.dart';
import 'onboarding/setup_flow.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(SeatCareApp(controller: WorkerController(), initialize: true));
}

class SeatCareApp extends StatefulWidget {
  const SeatCareApp({
    super.key,
    required this.controller,
    this.initialize = false,
  });
  final WorkerController controller;
  final bool initialize;
  @override
  State<SeatCareApp> createState() => _SeatCareAppState();
}

class _SeatCareAppState extends State<SeatCareApp> with WidgetsBindingObserver {
  int tab = 0, shownAlert = -1;
  bool setupRequested = false;
  WorkerController get c => widget.controller;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.initialize) unawaited(c.initialize());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if ([
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.detached,
    ].contains(state)) {
      unawaited(c.setForeground(false));
    }
    if (state == AppLifecycleState.resumed) unawaited(c.setForeground(true));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: c,
    builder: (context, _) => MaterialApp(
      title: 'Seat Care',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ko'),
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      supportedLocales: const [Locale('ko'), Locale('en')],
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: green,
          primary: green,
          onPrimary: onPrimary,
          primaryContainer: selectedBackground,
          onPrimaryContainer: green,
          secondary: green,
          onSecondary: onPrimary,
          secondaryContainer: selectedBackground,
          onSecondaryContainer: green,
          tertiary: caution,
          onTertiary: onPrimary,
          tertiaryContainer: cautionBackground,
          onTertiaryContainer: caution,
          surface: cardBackground,
          onSurface: ink,
          onSurfaceVariant: muted,
          surfaceDim: appBackground,
          surfaceBright: cardBackground,
          surfaceContainerLowest: cardBackground,
          surfaceContainerLow: cardBackground,
          surfaceContainer: appBackground,
          surfaceContainerHigh: cardBackground,
          surfaceContainerHighest: selectedBackground,
          outline: borderColor,
          outlineVariant: borderColor,
          error: danger,
          onError: onPrimary,
          errorContainer: dangerBackground,
          onErrorContainer: danger,
          inverseSurface: ink,
          onInverseSurface: cardBackground,
          inversePrimary: selectedBackground,
          surfaceTint: Colors.transparent,
        ),
        scaffoldBackgroundColor: appBackground,
        dividerColor: borderColor,
        dividerTheme: const DividerThemeData(color: borderColor),
        appBarTheme: const AppBarTheme(
          backgroundColor: appBackground,
          foregroundColor: ink,
          surfaceTintColor: Colors.transparent,
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: appBackground,
          indicatorColor: selectedBackground,
          surfaceTintColor: Colors.transparent,
        ),
        dialogTheme: const DialogThemeData(
          backgroundColor: cardBackground,
          surfaceTintColor: Colors.transparent,
        ),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
          color: green,
          linearTrackColor: selectedBackground,
        ),
        textTheme: ThemeData.light().textTheme.apply(
          bodyColor: ink,
          displayColor: ink,
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(
            borderSide: BorderSide(color: borderColor),
          ),
          enabledBorder: OutlineInputBorder(
            borderSide: BorderSide(color: borderColor),
          ),
          disabledBorder: OutlineInputBorder(
            borderSide: BorderSide(color: borderColor),
          ),
          focusedBorder: OutlineInputBorder(
            borderSide: BorderSide(color: green, width: 2),
          ),
          errorBorder: OutlineInputBorder(
            borderSide: BorderSide(color: danger),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderSide: BorderSide(color: danger, width: 2),
          ),
          labelStyle: TextStyle(color: muted),
          floatingLabelStyle: TextStyle(color: green),
          hintStyle: TextStyle(color: muted),
          errorStyle: TextStyle(color: danger),
          filled: true,
          fillColor: cardBackground,
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(48, 52),
            backgroundColor: green,
            foregroundColor: onPrimary,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(48, 52),
            foregroundColor: green,
            side: const BorderSide(color: borderColor),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(
            c.largeText ? 1.3 : MediaQuery.textScalerOf(context).scale(1),
          ),
        ),
        child: child!,
      ),
      home: Builder(
        builder: (context) {
          if (widget.initialize && !c.initialized) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          if (!c.setupCompleted || setupRequested) {
            return SetupFlow(
              controller: c,
              onFinished: () => setState(() {
                setupRequested = false;
                tab = 0;
              }),
              onClose: c.setupCompleted
                  ? () => setState(() => setupRequested = false)
                  : null,
            );
          }
          if (c.care.alert != null &&
              c.care.lastAlert != shownAlert &&
              c.foreground) {
            shownAlert = c.care.lastAlert;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!context.mounted || c.care.alert == null) return;
              showDialog<void>(
                context: context,
                builder: (dialogContext) => AnimatedBuilder(
                  animation: c,
                  builder: (context, _) => AlertDialog(
                    backgroundColor: c.care.alert == null
                        ? cardBackground
                        : cautionBackground,
                    titleTextStyle: Theme.of(context).textTheme.headlineSmall
                        ?.copyWith(color: c.care.alert == null ? ink : caution),
                    contentTextStyle: Theme.of(context).textTheme.bodyMedium
                        ?.copyWith(color: c.care.alert == null ? ink : caution),
                    title: Text(
                      c.care.alert == null ? '현재 안내를 확인했어요' : '압력 완화 안내',
                    ),
                    content: SingleChildScrollView(
                      child: Text(c.care.alert ?? '최신 상태는 내 시트 화면에서 확인해 주세요.'),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () {
                          Navigator.pop(dialogContext);
                        },
                        child: const Text('닫기'),
                      ),
                      if (c.care.alert != null)
                        TextButton(
                          onPressed: () {
                            c.run(() => c.care.acknowledge(c.now));
                            Navigator.pop(dialogContext);
                          },
                          child: const Text('확인했어요'),
                        ),
                      if (c.care.alert != null && c.sharingEnabled)
                        FilledButton(
                          onPressed: () {
                            c.help();
                            Navigator.pop(dialogContext);
                          },
                          child: const Text('도움이 필요해요'),
                        ),
                    ],
                  ),
                ),
              );
            });
          }
          return Scaffold(
            appBar: AppBar(
              title: const Text(
                'Seat Care',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  letterSpacing: -.7,
                ),
              ),
              backgroundColor: appBackground,
              actions: [
                TextButton(
                  onPressed: c.toggleText,
                  child: Text(c.largeText ? '기본 글씨' : '큰 글씨'),
                ),
              ],
            ),
            body: SafeArea(
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 600),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                    children: [
                      if (!c.initialized && widget.initialize)
                        const LinearProgressIndicator(),
                      if (c.error.isNotEmpty) notice(c.error, error: true),
                      if (c.storageError.isNotEmpty)
                        notice(c.storageError, error: true),
                      ...switch (tab) {
                        0 => home(context),
                        1 => history(context),
                        _ => settings(context),
                      },
                    ],
                  ),
                ),
              ),
            ),
            bottomNavigationBar: NavigationBar(
              selectedIndex: tab,
              labelBehavior: NavigationDestinationLabelBehavior.alwaysHide,
              onDestinationSelected: (value) => setState(() => tab = value),
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home_rounded),
                  label: '홈',
                ),
                NavigationDestination(
                  icon: Icon(Icons.history_rounded),
                  label: '기록',
                ),
                NavigationDestination(
                  icon: Icon(Icons.settings_outlined),
                  selectedIcon: Icon(Icons.settings_rounded),
                  label: '설정',
                ),
              ],
            ),
          );
        },
      ),
    ),
  );
  List<Widget> home(BuildContext context) {
    final care = c.care;
    final title = c.calibrationLimited && c.connected
        ? '센서값 확인 모드'
        : !c.connected
        ? '방석 연결 대기'
        : c.status != 'READY'
        ? '기기 보정 필요'
        : care.quality == 'unloaded'
        ? '좌면 부하 없음'
        : !c.usable
        ? '수신 확인 필요'
        : care.baseline == null
        ? '개인 기준 미등록'
        : care.bias.isNotEmpty
        ? '압력 완화가 필요해요'
        : '개인 기준 범위';
    return [
      heading('내 시트', '내 몸의 변화를 천천히 확인해요.'),
      card([
        Row(
          children: [
            const Expanded(
              child: Text(
                '압력 분포',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
              ),
            ),
            badge('센서 5개'),
          ],
        ),
        const SizedBox(height: 14),
        Text(
          title,
          style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 5),
        Text(
          c.displayValues != null
              ? '${c.calibrationLimited ? '센서값 확인 중' : '실제 센서 수신 중'} · ${c.device}'
              : '최근 유효한 센서값을 기다리고 있어요.',
          style: const TextStyle(color: muted),
        ),
        const SizedBox(height: 18),
        PressureMap(values: c.displayValues),
        const SizedBox(height: 16),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          children: [
            const Text('낮음', style: TextStyle(fontSize: 12)),
            Container(
              width: 80,
              height: 8,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                gradient: const LinearGradient(
                  colors: [selectedBackground, green, caution],
                ),
              ),
            ),
            const Text('높음 · 5점 보간 · 상대 부하', style: TextStyle(fontSize: 12)),
          ],
        ),
        const Divider(height: 28),
        Wrap(
          spacing: 20,
          runSpacing: 12,
          children: List.generate(
            5,
            (i) => Column(
              children: [
                Text(channelIds[i], style: const TextStyle(fontSize: 12)),
                Text(
                  c.displayValues != null
                      ? '${c.displayValues![i].round()}'
                      : '—',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 17,
                  ),
                ),
              ],
            ),
          ),
        ),
      ]),
      card([
        Text(
          care.alert ?? '지금의 안내',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 18,
            color: care.alert != null ? caution : ink,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          care.message,
          style: TextStyle(
            height: 1.6,
            color: care.alert != null ? caution : ink,
          ),
        ),
        if (care.alert != null) ...[
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => c.run(() => care.acknowledge(c.now)),
            child: const Text('안내 확인'),
          ),
        ],
      ], color: care.alert != null ? cautionBackground : selectedBackground),
      if (!c.connected)
        FilledButton(
          onPressed: () => setState(() => tab = 2),
          child: const Text('방석 연결하기'),
        ),
      if (c.calibrationLimited && c.connected)
        notice(
          '센서 경고를 확인하고 계속했어요. 값만 표시하며 개인 기준·자동 압력 안내는 보류해요. 설정에서 처음부터 다시 보정할 수 있어요.',
        ),
      if (c.connected && c.status != 'READY') ...calibration(),
      if (c.connected && c.status == 'READY' && !c.calibrationLimited)
        card([
          const Text(
            '내 착석 기준',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const Text('평소 편안하게 앉은 상태를 기준으로 비교해요. 좌우가 완전히 같을 필요는 없어요.'),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('실물 센서의 순서와 위치를 확인했어요'),
            subtitle: const Text('L1·R1 앞 / L2·R2 뒤 / C1 중앙 뒤'),
            value: care.layoutConfirmed,
            onChanged: (v) => c.run(() => care.layoutConfirmed = v ?? false),
          ),
          if (care.capture != null) ...[
            LinearProgressIndicator(
              value: (care.captureElapsed / 10000).clamp(0, 1),
            ),
            Text('${care.captureElapsed ~/ 1000} / 10초 · 편안하게 유지해 주세요.'),
          ],
          if (care.capture == null)
            OutlinedButton(
              onPressed: c.usable
                  ? () => c.run(() => care.startBaseline(c.now))
                  : null,
              child: Text(care.baseline == null ? '개인 기준 등록' : '개인 기준 다시 등록'),
            ),
        ]),
      if (care.baseline != null && c.connected)
        card([
          const Text(
            '압력 완화 확인',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const Text(
            '부위를 고르고 편안한 범위에서 압력을 덜어보세요. 실제 부하가 30% 이상 줄고 20초 유지되면 기록해요.',
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: List.generate(
              5,
              (i) => OutlinedButton(
                onPressed:
                    c.usable &&
                        (care.reliefIndex == null || care.reliefComplete)
                    ? () => c.run(() => care.beginRelief(i, c.now))
                    : null,
                child: Text(channelLabels[i]),
              ),
            ),
          ),
          if (care.reliefIndex != null) ...[
            const SizedBox(height: 12),
            Text(
              care.reliefComplete
                  ? '완화 조건을 충족했어요'
                  : '${channelLabels[care.reliefIndex!]} · 유효 유지 ${care.heldMs ~/ 1000} / 20초',
            ),
            LinearProgressIndicator(value: (care.heldMs / 20000).clamp(0, 1)),
            if (!care.reliefComplete)
              TextButton(
                onPressed: () =>
                    c.run(() => care.stopRelief('사용자가 취소했어요', c.now)),
                child: const Text('확인 취소'),
              ),
          ],
        ]),
      if (c.sharingEnabled)
        card([
          const Text(
            '관리자에게 도움 요청',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
          ),
          const SizedBox(height: 8),
          const Text('요청은 공유 관리자 웹에 표시돼요. 관리자 확인 여부는 기록에서 볼 수 있어요.'),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: c.help,
            icon: const Icon(Icons.volunteer_activism_outlined),
            label: const Text('도움이 필요해요'),
          ),
          const SizedBox(height: 8),
          Text(c.syncMessage),
        ]),
      const SizedBox(height: 16),
      const Text(
        '개인 기준 대비 압력 변화 추정 · 의료 진단 수치가 아닙니다.\n앱을 열어둔 동안 측정하며, 화면 잠금 시 중단돼요.',
        style: TextStyle(fontSize: 12, height: 1.6, color: muted),
      ),
    ];
  }

  List<Widget> calibration() {
    final balance =
        c.status.startsWith('BALANCE') || c.status == 'CALIBRATION_FAILED';
    return [
      card([
        Text(
          balance ? '2. 평소처럼 앉아 주세요' : '1. 방석을 비워 주세요',
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Text(
          balance
              ? '기기 보정을 위해 5초 동안 편안하게 앉아 주세요.'
              : '방석 위 사람과 물건을 치운 뒤 5초 동안 측정해요.',
        ),
        if (c.warnings.isNotEmpty)
          notice(
            '확인할 센서: ${c.warnings.map((i) => channelIds[i - 1]).join(", ")} · 다시 측정해 주세요.',
          ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: c.commandPending
              ? null
              : () =>
                    c.command(balance ? 'CALIBRATE_BALANCE' : 'CALIBRATE_ZERO'),
          child: Text(
            c.commandPending
                ? '측정 응답 기다리는 중'
                : balance
                ? '앉은 자세 측정'
                : '빈 방석 측정',
          ),
        ),
        TextButton(
          onPressed: c.commandPending
              ? null
              : () => c.command('GET_CALIBRATION_STATUS'),
          child: const Text('보정 상태 다시 읽기'),
        ),
      ]),
    ];
  }

  List<Widget> history(BuildContext context) => [
    heading('수행 기록', '실제로 관측한 변화와 내 요청'),
    card([
      Text(
        '완화 조건 충족 ${c.events.where((e) => e["type"] == "relief_completed").length}회',
        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 8),
      const Text('버튼을 누르거나 안내를 확인한 것만으로 수행 완료를 기록하지 않아요.'),
    ]),
    if (c.events.isEmpty) card([const Text('아직 기록이 없어요. 방석을 연결해 시작해 주세요.')]),
    ...c.events.reversed
        .take(100)
        .map(
          (e) => card([
            Text(
              '${eventLabels[e["type"]] ?? e["type"]}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
            ),
            const SizedBox(height: 6),
            Text('${e["detail"]}'),
            const SizedBox(height: 8),
            Text(
              formatTime(e['at'] as int),
              style: const TextStyle(fontSize: 12, color: muted),
            ),
            if (c.pendingIds.contains(e['id']))
              const Text(
                '서버 전송 대기',
                style: TextStyle(fontSize: 12, color: caution),
              ),
            if (c.acknowledgements.containsKey(e['id']))
              Text(
                '관리자 확인 · ${formatTime(c.acknowledgements[e['id']]['at'] as int)}',
                style: const TextStyle(
                  color: green,
                  fontWeight: FontWeight.bold,
                ),
              ),
          ]),
        ),
    const Text(
      '최근 100개 표시 · 기기에는 최근 90일, 최대 2,000개를 보관해요.',
      style: TextStyle(fontSize: 12),
    ),
  ];
  List<Widget> settings(BuildContext context) => [
    heading('기기와 공유', '내 방석을 연결하고 공유 범위를 정해요.'),
    OutlinedButton.icon(
      onPressed: () => setState(() => setupRequested = true),
      icon: const Icon(Icons.restart_alt_rounded),
      label: const Text('처음 설정 다시 보기'),
    ),
    const SizedBox(height: 16),
    card([
      const Text(
        '내 방석',
        style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 8),
      Text(
        c.connected
            ? '${c.device} · 연결됨'
            : c.connecting
            ? '방석 연결 중'
            : '연결된 방석이 없어요.',
      ),
      const SizedBox(height: 12),
      if (c.connected)
        OutlinedButton(
          onPressed: () => c.ble.disconnect(),
          child: const Text('방석 연결 해제'),
        )
      else
        FilledButton.icon(
          onPressed: c.scanning || c.connecting ? null : c.startScan,
          icon: const Icon(Icons.bluetooth_searching),
          label: Text(c.scanning ? '주변 방석 찾는 중…' : '주변 방석 찾기'),
        ),
      if (c.scanning)
        TextButton(onPressed: c.stopScan, child: const Text('검색 중지')),
      if (!c.connected && c.devices.isNotEmpty)
        ...c.devices.values.map(
          (d) => ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(d.name.isEmpty ? '이름 없는 ESP32' : d.name),
            subtitle: Text('신호 ${d.rssi} dBm'),
            trailing: const Icon(Icons.chevron_right),
            onTap: c.connecting ? null : () => c.connect(d),
          ),
        ),
      const SizedBox(height: 8),
      const Text(
        '방석 라벨의 ESP32 기기 코드를 확인해 선택해 주세요.',
        style: TextStyle(fontSize: 12),
      ),
    ]),
    card([
      const Text(
        '관리자 데이터 공유',
        style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 8),
      Text(
        c.invite == null
            ? '관리자가 전달한 사용자용 초대 링크를 연결해 주세요.'
            : '공유 서버: ${c.invite!.endpoint.host}',
      ),
      const SizedBox(height: 12),
      OutlinedButton(
        onPressed: c.sharingEnabled || c.syncing
            ? null
            : () => configure(context),
        child: Text(c.invite == null ? '사용자 초대 링크 연결' : '공유 대상 변경'),
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('센서 상태와 이후 기록 공유'),
        subtitle: const Text('5초 간격 상태 · 완화 기록 · 도움 요청'),
        value: c.sharingEnabled,
        onChanged: c.invite == null || c.syncing
            ? null
            : (v) => c.run(() => unawaited(c.setSharing(v))),
      ),
      Text(c.syncMessage, style: const TextStyle(height: 1.5)),
      if (c.lastSyncAt > 0)
        Text(
          '마지막 전송 ${formatTime(c.lastSyncAt)}',
          style: const TextStyle(fontSize: 12),
        ),
      const SizedBox(height: 10),
      const Text(
        '공유를 끄면 새 전송과 미전송 기록을 중지해요. 이미 서버에 보낸 기록은 유지돼요. 공유를 켜기 전의 기록은 전송하지 않아요.',
        style: TextStyle(fontSize: 12, height: 1.5),
      ),
    ]),
    card([
      const Text(
        '알림과 측정',
        style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('압력 완화 화면 알림'),
        value: c.care.alertsEnabled,
        onChanged: (v) => c.run(() {
          c.care.alertsEnabled = v;
          if (!v) c.care.alert = null;
        }),
      ),
      const Text(
        '앱을 열어둔 동안 BLE를 수신해요. 화면을 잠그거나 다른 앱으로 이동하면 측정을 중단하고, 돌아온 뒤 방석을 다시 연결해요. OS 푸시·잠금 화면 알림은 아직 포함하지 않아요.',
        style: TextStyle(height: 1.6),
      ),
    ]),
  ];
  Future<void> configure(BuildContext context) async {
    final input = TextEditingController();
    String message = '';
    bool busy = false;
    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: const Text('사용자 초대 링크'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('링크가 가리키는 서버로 센서 상태와 기록을 전송해요. 연결 후 공유 스위치를 켜 주세요.'),
                const SizedBox(height: 16),
                TextField(
                  controller: input,
                  obscureText: true,
                  enableSuggestions: false,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'https://…/sensor/#key=…',
                  ),
                ),
                if (message.isNotEmpty)
                  Text(message, style: const TextStyle(color: danger)),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(context),
              child: const Text('취소'),
            ),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      setDialog(() => busy = true);
                      try {
                        await c.configureSharing(input.text);
                        if (context.mounted) Navigator.pop(context);
                      } catch (e) {
                        if (context.mounted) {
                          setDialog(() {
                            message = cleanError(e);
                            busy = false;
                          });
                        }
                      }
                    },
              child: Text(busy ? '확인 중…' : '연결 확인'),
            ),
          ],
        ),
      ),
    );
    // Dialog closing animation may still use the field; defer controller disposal.
    await Future<void>.delayed(const Duration(milliseconds: 300));
    input.dispose();
  }
}

Widget heading(String title, String subtitle) => Padding(
  padding: const EdgeInsets.only(bottom: 20),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(
          fontSize: 30,
          fontWeight: FontWeight.w700,
          letterSpacing: -1,
        ),
      ),
      const SizedBox(height: 6),
      Text(subtitle, style: const TextStyle(color: muted, height: 1.5)),
    ],
  ),
);
Widget card(List<Widget> children, {Color color = cardBackground}) => Padding(
  padding: const EdgeInsets.only(bottom: 16),
  child: Material(
    color: color,
    shape: RoundedRectangleBorder(
      side: const BorderSide(color: borderColor),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    ),
  ),
);
Widget badge(String text) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
  decoration: BoxDecoration(
    color: selectedBackground,
    borderRadius: BorderRadius.circular(30),
  ),
  child: Text(text, style: const TextStyle(fontSize: 12, color: green)),
);
Widget notice(String text, {bool error = false}) => Container(
  margin: const EdgeInsets.only(bottom: 12),
  padding: const EdgeInsets.all(14),
  decoration: BoxDecoration(
    color: error ? dangerBackground : cautionBackground,
    borderRadius: BorderRadius.circular(12),
  ),
  child: Text(
    text,
    style: TextStyle(height: 1.5, color: error ? danger : caution),
  ),
);
String formatTime(int at) {
  final d = DateTime.fromMillisecondsSinceEpoch(at);
  String pad(int n) => '$n'.padLeft(2, '0');
  return '${d.month}/${d.day} ${pad(d.hour)}:${pad(d.minute)}:${pad(d.second)}';
}

class PressureMap extends StatelessWidget {
  const PressureMap({super.key, required this.values});
  final List<double>? values;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      const Text('앞 · 무릎', style: TextStyle(fontSize: 12)),
      const SizedBox(height: 6),
      Semantics(
        label: values == null
            ? '유효한 센서값 없음'
            : '센서 5개로 추정한 상대 부하 분포. ${List.generate(5, (i) => '${channelLabels[i]} ${values![i].round()}').join(", ")}',
        child: ClipRRect(
          borderRadius: BorderRadius.circular(38),
          child: CustomPaint(
            size: const Size(210, 254),
            painter: PressurePainter(values),
          ),
        ),
      ),
      const SizedBox(height: 6),
      const Text('뒤 · 등받이', style: TextStyle(fontSize: 12)),
    ],
  );
}

class PressurePainter extends CustomPainter {
  PressurePainter(this.values);
  final List<double>? values;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = selectedBackground);
    if (values != null) {
      for (var y = 0; y < 60; y++) {
        for (var x = 0; x < 48; x++) {
          final p = pressureAt(values!, (x + .5) / 48, (y + .5) / 60) / 3200;
          final color = p < .04
              ? selectedBackground
              : p < .5
              ? Color.lerp(selectedBackground, green, p * 2)!
              : Color.lerp(green, caution, (p - .5) * 2)!;
          canvas.drawRect(
            Rect.fromLTWH(
              x * size.width / 48,
              y * size.height / 60,
              size.width / 48 + 1,
              size.height / 60 + 1,
            ),
            Paint()..color = color,
          );
        }
      }
    }
    for (var i = 0; i < 5; i++) {
      final point = channelPositions[i];
      final center = Offset(point.$1 * size.width, point.$2 * size.height);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: center, width: 30, height: 24),
          const Radius.circular(7),
        ),
        Paint()..color = cardBackground,
      );
      final text = TextPainter(
        text: TextSpan(
          text: channelIds[i],
          style: const TextStyle(
            color: ink,
            fontFamily: 'Roboto',
            fontSize: 11,
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      text.paint(canvas, center - Offset(text.width / 2, text.height / 2));
    }
  }

  @override
  bool shouldRepaint(PressurePainter oldDelegate) =>
      oldDelegate.values != values;
}
