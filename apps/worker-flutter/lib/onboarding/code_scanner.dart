import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../domain/sensor.dart';
import '../theme/palette.dart';

class CodeScanner extends StatefulWidget {
  const CodeScanner({super.key});
  @override
  State<CodeScanner> createState() => _CodeScannerState();
}

class _CodeScannerState extends State<CodeScanner> {
  bool accepted = false;
  String? message;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('기기 코드 스캔')),
    body: SafeArea(
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              '방석 라벨의 QR·바코드를 화면 안에 맞춰 주세요.',
              style: TextStyle(height: 1.6),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                // The widget-owned controller handles pause/resume and camera disposal.
                child: MobileScanner(
                  onDetect: (capture) {
                    if (accepted) return;
                    for (final barcode in capture.barcodes) {
                      final code = deviceCode(barcode.rawValue ?? '');
                      if (code == null) continue;
                      accepted = true;
                      Navigator.pop(context, code);
                      return;
                    }
                    if (message == null) {
                      setState(
                        () => message = '방석용 코드가 아니에요. ESP32 라벨을 다시 비춰 주세요.',
                      );
                    }
                  },
                  errorBuilder: (context, error) => Container(
                    color: selectedBackground,
                    padding: const EdgeInsets.all(24),
                    alignment: Alignment.center,
                    child: const Text(
                      '카메라를 사용할 수 없어요.\n휴대폰 설정에서 카메라 권한을 허용하거나\n코드를 직접 입력해 주세요.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: ink, height: 1.7),
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (message != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(message!, style: const TextStyle(color: caution)),
            ),
          Padding(
            padding: const EdgeInsets.all(24),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('코드 직접 입력으로 돌아가기'),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
