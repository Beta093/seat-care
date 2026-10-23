import 'package:flutter/material.dart';
import '../domain/sensor.dart';
import '../theme/palette.dart';
import '../worker_controller.dart';
import 'code_scanner.dart';

class SetupFlow extends StatefulWidget {
  const SetupFlow({
    super.key,
    required this.controller,
    required this.onFinished,
    this.onClose,
  });
  final WorkerController controller;
  final VoidCallback onFinished;
  final VoidCallback? onClose;
  @override
  State<SetupFlow> createState() => _SetupFlowState();
}

class _SetupFlowState extends State<SetupFlow> {
  final code = TextEditingController();
  bool started = false, saving = false;
  String? filter, codeError;
  WorkerController get c => widget.controller;
  @override
  void initState() {
    super.initState();
    started = c.connected || c.setupCompleted;
  }

  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  Future<void> search() async {
    final entered = code.text.trim();
    final parsed = deviceCode(entered);
    if (entered.isNotEmpty && parsed == null) {
      setState(() => codeError = '라벨의 6자리 코드를 확인해 주세요. 예: A1B2C3');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      filter = parsed;
      codeError = null;
    });
    await c.startScan();
  }

  Future<void> scanCode() async {
    await c.stopScan();
    if (!mounted) return;
    final value = await Navigator.of(
      context,
    ).push<String>(MaterialPageRoute(builder: (_) => const CodeScanner()));
    if (!mounted || value == null) return;
    setState(() {
      code.text = value;
      filter = value;
      codeError = null;
    });
    await search();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: c,
    builder: (context, _) {
      final welcome = !started && !c.connected;
      final ready = c.connected && c.status == 'READY';
      final balance = c.status.startsWith('BALANCE') || ready;
      return Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: const Text(
            'Seat Care',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          actions: [
            TextButton(
              onPressed: c.toggleText,
              child: Text(
                c.largeText ? '기본 글씨' : '큰 글씨',
                style: const TextStyle(fontSize: 13),
              ),
            ),
            if (widget.onClose != null)
              IconButton(
                onPressed: widget.onClose,
                tooltip: '설정으로 돌아가기',
                icon: const Icon(Icons.close),
              ),
          ],
        ),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: LayoutBuilder(
                builder: (context, bounds) => SingleChildScrollView(
                  key: ValueKey(
                    welcome
                        ? 'welcome'
                        : !c.connected
                        ? 'connect'
                        : c.status,
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: (bounds.maxHeight - 36).clamp(
                        0,
                        double.infinity,
                      ),
                    ),
                    child: IntrinsicHeight(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (c.error.isNotEmpty)
                            _Message(c.error, error: true),
                          if (c.storageError.isNotEmpty)
                            _Message(c.storageError, error: true),
                          if (welcome)
                            ...welcomeContent()
                          else if (!c.connected)
                            ...connectionContent()
                          else
                            ...calibrationContent(balance, ready),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );

  List<Widget> welcomeContent() => [
    const Spacer(),
    const _Title('방석을 연결해 주세요'),
    const SizedBox(height: 10),
    const _Detail('전원을 켜고 휴대폰 가까이에 놓아 주세요.'),
    const SizedBox(height: 36),
    const CushionIllustration(),
    const Spacer(),
    FilledButton(
      onPressed: () => setState(() => started = true),
      child: const Text('내 방석 연결하기'),
    ),
  ];

  List<Widget> connectionContent() {
    final devices = c.devices.values
        .where((d) => filter == null || deviceCode(d.name) == filter)
        .toList();
    return [
      const SizedBox(height: 28),
      const Text(
        '기기 연결',
        style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 10),
      const Text(
        '방석 라벨의 코드를 확인해 주세요.',
        style: TextStyle(color: muted, height: 1.5),
      ),
      const SizedBox(height: 32),
      OutlinedButton.icon(
        onPressed: c.connecting ? null : scanCode,
        icon: const Icon(Icons.qr_code_scanner, size: 20),
        label: const Text('기기 코드 스캔'),
      ),
      const SizedBox(height: 20),
      TextField(
        controller: code,
        enabled: !c.scanning && !c.connecting,
        textCapitalization: TextCapitalization.characters,
        autocorrect: false,
        maxLength: 16,
        decoration: InputDecoration(
          labelText: '기기 코드',
          hintText: '예: A1B2C3',
          errorText: codeError,
          counterText: '',
        ),
        onSubmitted: (_) => search(),
      ),
      const SizedBox(height: 12),
      FilledButton(
        onPressed: c.scanning || c.connecting ? null : search,
        child: Text(c.scanning ? '주변 방석 찾는 중…' : '주변 방석 찾기'),
      ),
      const SizedBox(height: 10),
      const Text(
        '코드를 모르면 비워 두고 검색하세요.',
        style: TextStyle(color: muted, fontSize: 12),
      ),
      const SizedBox(height: 32),
      Row(
        children: [
          const Expanded(
            child: Text(
              '주변 기기',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          if (c.scanning)
            TextButton(onPressed: c.stopScan, child: const Text('검색 중지')),
        ],
      ),
      if (filter != null)
        Text('코드 $filter', style: const TextStyle(color: muted, fontSize: 12)),
      const Divider(height: 24),
      if (c.scanning || c.connecting)
        const LinearProgressIndicator(minHeight: 2),
      if (devices.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 36),
          child: _Detail(
            c.scanning
                ? '검색 중…'
                : c.connecting
                ? '연결 중…'
                : '검색된 기기가 없습니다.',
          ),
        ),
      for (final d in devices) ...[
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(d.name.isEmpty ? '이름 없는 ESP32' : d.name),
          subtitle: Text(c.connecting ? '연결 중…' : '신호 ${d.rssi} dBm'),
          trailing: const Icon(Icons.chevron_right, size: 20),
          onTap: c.connecting ? null : () => c.connect(d),
        ),
        const Divider(height: 1),
      ],
      const Spacer(),
    ];
  }

  List<Widget> calibrationContent(bool balance, bool ready) {
    final checking = c.status == 'checking';
    final warning = c.status.endsWith('WARNING');
    final failed = c.status.endsWith('FAILED');
    final measuring = c.commandPending && c.calibrationStartedAt != null;
    final elapsed = c.calibrationStartedAt == null
        ? 0
        : c.now - c.calibrationStartedAt!;
    final remaining = ((5000 - elapsed) / 1000).ceil().clamp(0, 5);
    final title = ready
        ? '설정 완료'
        : checking
        ? '연결 확인 중'
        : warning
        ? '센서 확인이 필요합니다'
        : failed
        ? '다시 측정해 주세요'
        : measuring
        ? (balance ? '앉은 자세 측정 중' : '영점 측정 중')
        : balance
        ? '편안하게 앉아 주세요'
        : '방석을 비워 주세요';
    final description = ready
        ? '개인 착석 기준은 홈에서 등록할 수 있습니다.'
        : checking
        ? '방석의 응답을 기다리고 있습니다.'
        : warning
        ? '센서의 접촉 상태를 확인해 주세요.'
        : balance
        ? '평소 자세로 앉아 5초간 유지해 주세요.'
        : '방석 위의 사람과 물건을 치워 주세요.';
    return [
      Row(
        children: [
          const Icon(Icons.bluetooth_connected, color: green, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              c.device,
              style: const TextStyle(color: muted, fontSize: 12),
            ),
          ),
          IconButton(
            onPressed: () => c.ble.disconnect(),
            tooltip: '방석 연결 해제',
            icon: const Icon(Icons.link_off, size: 18, color: muted),
          ),
        ],
      ),
      const Spacer(),
      if (!ready && !checking) ...[
        _Detail('${balance ? '2' : '1'} / 2'),
        const SizedBox(height: 12),
      ],
      _Title(title),
      const SizedBox(height: 10),
      _Detail(description),
      const SizedBox(height: 36),
      const CushionIllustration(),
      const SizedBox(height: 28),
      if (measuring) ...[
        LinearProgressIndicator(
          minHeight: 3,
          value: (elapsed / 5000).clamp(0, .95),
        ),
        const SizedBox(height: 12),
        _Detail(remaining > 0 ? '약 $remaining초 남음' : '측정 결과를 기다리고 있습니다.'),
      ],
      if (checking && c.error.isEmpty)
        const LinearProgressIndicator(minHeight: 3),
      const Spacer(),
      if (warning)
        _Message(
          '확인할 센서: ${c.warnings.map((i) => '${channelIds[i - 1]} · ${channelLabels[i - 1]}').join(', ')}\n계속 진행하면 자동 압력 안내는 중지됩니다.',
        ),
      if (failed) const _Message('방석 상태를 확인한 뒤 다시 측정해 주세요.', error: true),
      if (ready && c.calibrationLimited)
        const _Message('센서값만 표시합니다. 자동 압력 안내는 재보정 후 사용할 수 있습니다.'),
      if (ready) ...[
        FilledButton(
          onPressed: saving
              ? null
              : () async {
                  setState(() => saving = true);
                  final done = await c.completeSetup();
                  if (!mounted) return;
                  setState(() => saving = false);
                  if (done) widget.onFinished();
                },
          child: Text(saving ? '저장 중…' : '내 시트 시작하기'),
        ),
        TextButton(
          onPressed: c.commandPending
              ? null
              : () => c.command('CALIBRATE_ZERO'),
          child: const Text('다시 측정'),
        ),
      ] else if (checking)
        OutlinedButton(
          onPressed: c.commandPending
              ? null
              : () => c.command('GET_CALIBRATION_STATUS'),
          child: const Text('상태 다시 읽기'),
        )
      else ...[
        FilledButton(
          onPressed: c.commandPending
              ? null
              : () =>
                    c.command(balance ? 'CALIBRATE_BALANCE' : 'CALIBRATE_ZERO'),
          child: Text(
            c.commandPending
                ? '측정 중…'
                : warning || failed
                ? '다시 측정'
                : balance
                ? '앉은 자세 측정하기'
                : '빈 방석 측정하기',
          ),
        ),
        if (warning)
          TextButton(
            onPressed: c.commandPending
                ? null
                : () => c.command(
                    balance
                        ? 'CONTINUE_BALANCE_CALIBRATION'
                        : 'CONTINUE_ZERO_CALIBRATION',
                  ),
            child: const Text('센서값만 확인하며 계속'),
          ),
        if (c.error.isNotEmpty)
          TextButton(
            onPressed: c.commandPending
                ? null
                : () => c.command('GET_CALIBRATION_STATUS'),
            child: const Text('상태 다시 읽기'),
          ),
      ],
    ];
  }
}

class _Title extends StatelessWidget {
  const _Title(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
    text,
    textAlign: TextAlign.center,
    style: const TextStyle(
      fontSize: 24,
      fontWeight: FontWeight.w600,
      height: 1.4,
    ),
  );
}

class _Detail extends StatelessWidget {
  const _Detail(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
    text,
    textAlign: TextAlign.center,
    style: const TextStyle(color: muted, fontSize: 14, height: 1.6),
  );
}

class _Message extends StatelessWidget {
  const _Message(this.text, {this.error = false});
  final String text;
  final bool error;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: error ? dangerBackground : cautionBackground,
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      text,
      style: TextStyle(
        color: error ? danger : caution,
        fontSize: 13,
        height: 1.6,
      ),
    ),
  );
}

// Original project asset, distributed with THIRD_PARTY_LICENSE.txt.
class CushionIllustration extends StatelessWidget {
  const CushionIllustration({super.key});
  @override
  Widget build(BuildContext context) => Center(
    child: Image.asset(
      'assets/images/cushion.png',
      width: 224,
      height: 224,
      fit: BoxFit.contain,
      semanticLabel: '방석',
    ),
  );
}
