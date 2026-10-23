# Seat Care · Flutter 사용자 앱

기존 사용자 웹의 화면 구성과 ESP32 통신 규격을 옮긴 별도 Android/iOS 프로젝트입니다. WebView로 웹을 감싼 앱이 아니라 Dart/Flutter 위젯으로 작성했습니다. 기존 `apps/mobile-web`, `apps/admin-web`, 루트 `android/ios`(이전 Capacitor)는 별도 유지합니다.

## 현재 구현

- 첫 실행: 시작 안내 → QR·코드 입력/주변 BLE 검색 → 빈 방석 측정 → 앉은 자세 측정 → 홈. 완료 여부를 기기에 저장하고, 설정의 `처음 설정 다시 보기`에서 다시 열 수 있습니다.
- 집 / 기록 / 설정 아이콘만 표시하는 하단 내비게이션, 큰 글씨, 5센서 상대 부하 보간 지도. 지정된 크림·초록 팔레트를 유지합니다.
- 주변 BLE 방석 검색·선택, 서비스/RX/TX 연결, Android MTU 64, `P:` 압력·`S:` 상태 수신.
- 빈 방석 약 5초 → 착석 약 5초 기기 보정. 진행 시간은 안내용이며 실제 `S:` 응답을 받아야 단계가 바뀝니다. 연결 끊김·명령 실패·시간 초과 시 재연결/재측정할 수 있습니다.
- 센서 경고 시 해당 센서 이름을 표시하고 재측정 또는 `센서값만 확인하며 계속`을 제공합니다. 계속하기는 펌웨어의 `CONTINUE_*_CALIBRATION` 응답을 기다립니다. 이 세션은 전체 재보정 전까지 개인 기준·자동 판단을 보류하고 원본값만 표시합니다. 관리자에게는 유효한 판단 데이터로 전송하지 않습니다.
- 실물 배치 확인 후 10초 안정적인 개인 기준 등록. 30% 증가 10초 지속, 20% 이하 회복, 30분 완화 미확인 안내, 1분 재안내의 개발 기본값.
- 선택 부위의 실제 부하 30% 감소가 20초 유지될 때 수행 기록. 중복 완료, 통신 공백, 포화·영값, 좌면 부하 해제를 분리합니다.
- 앱 화면 알림 및 도움 요청. 관리자 웹 확인 여부는 기록에서 확인합니다.
- 로컬 JSON 원자적 저장, 최근 90일/최대 2,000개 이벤트. 관리자가 발급한 사용자 초대를 Keychain/Keystore 기반 저장소에 저장합니다.
- 공유 스위치를 켠 시점 이후 기록과 5초 간격 현재 상태를 공유합니다. 실패한 이벤트는 동일 ID로 재전송하며 서버가 중복 제거합니다. 공유를 끄면 미전송 큐는 비우고 기기 기록은 유지합니다.

## 실행

Flutter **3.47.7 / Dart 3.13.5**로 분석·테스트했습니다. 의존성은 `pubspec.lock`에 고정되어 있습니다.

```sh
cd apps/worker-flutter
flutter pub get
flutter analyze
flutter test
flutter run
```

Android SDK/Java 또는 전체 Xcode 등 플랫폼 도구가 필요합니다. 현재 확인한 이 Mac에는 Android SDK와 전체 Xcode가 없어 APK/IPA를 빌드하지 않았습니다. Flutter SDK는 검증용으로 `/private/tmp/seat-care-flutter-sdk`에 받았으며 PATH·시스템 설정은 변경하지 않았습니다. 임시 SDK는 재부팅/정리 후 없어질 수 있습니다.

이 환경의 Flutter 분석 서버는 상위 한글 경로에서 JSON/LSP 오류가 발생했습니다. 검증 시 아래처럼 **소스만 영문 경로로 복사**했습니다. 원본 작업 폴더는 그대로 유지합니다.

```sh
rsync -a --exclude=.dart_tool --exclude=build apps/worker-flutter/ /private/tmp/seat-care-worker-check/
cd /private/tmp/seat-care-worker-check
/private/tmp/seat-care-flutter-sdk/bin/flutter pub get
/private/tmp/seat-care-flutter-sdk/bin/flutter analyze
/private/tmp/seat-care-flutter-sdk/bin/flutter test
```

## 실제 사용 순서

1. 처음 실행하면 `내 방석 연결하기`를 누릅니다. QR·바코드를 스캔하거나 `A1B2C3` / `ESP32:A1B2C3` / `ESP32-P-A1B2C3` 형식의 코드를 입력하고, 라벨과 같은 주변 기기를 선택합니다. 코드 생략 시 전체 주변 방석을 찾습니다.
2. 빈 방석 측정 → 앉은 자세 측정 → `내 시트 시작하기`를 누릅니다. 홈에서 실물 센서 배치를 확인하고 10초 개인 기준 등록을 진행합니다. 기기 보정과 개인 기준 등록은 별도입니다.
3. [서버 설정 문서](../../docs/flutter-sharing.md)에 따라 발급한 **사용자용** 초대 링크를 기기·공유에 붙여 넣고 연결 확인을 합니다.
4. 공유 서버 주소를 확인하고 공유 스위치를 켭니다. 기존 로컬 기록을 소급 업로드하지 않습니다.
5. 관리자는 같은 공유방의 **관리자용** 링크를 브라우저에서 엽니다. `/sensor/`에서 값·수행 기록·도움 요청을 조회하고 확인합니다.

화면을 잠그거나 다른 앱으로 이동하면 측정을 중단하고 BLE 연결을 해제합니다. 복귀 후 다시 연결하고 개인 기준을 재등록하세요. 앱 종료·백그라운드 BLE·OS 푸시·잠금 화면 알림은 현재 구현 범위에 없습니다.

## 파일

| 경로 | 역할 |
|---|---|
| `lib/main.dart` | 사용자 화면·압력 지도·접근성·첫 실행 분기 |
| `lib/onboarding/` | 시작 안내·QR 스캔·기기 선택·단계별 보정 |
| `lib/theme/palette.dart` | 공통 색상 |
| `lib/worker_controller.dart` | 수신·상태·기록 큐·공유·앱 생명주기 |
| `lib/domain/sensor.dart` | ESP32 프로토콜·채널·보간 |
| `lib/domain/care_engine.dart` | 개인 기준·지속 부하·완화 조건 |
| `lib/services/ble_transport.dart` | Bluetooth 검색·연결·구독·보정 명령 |
| `lib/services/local_store.dart` | 직렬화된 원자적 기기 저장 |
| `lib/services/sharing.dart` | 역할별 초대와 서버 API 클라이언트 |
| `test/` | 프로토콜·규칙·공유 큐·좁은 화면 테스트 |
| `tool/sharing_smoke.dart` | 로컬 Node 서버와 Dart 클라이언트 왕복 검증 |

Google/Apple 로그인과 Firebase 연결은 사용자 요청에 따라 이번 범위에서 제외했습니다. 기존 웹의 원본 프레임 재생·내보내기, 개별 임계값 설정 전체를 이식한 것은 아닙니다. 이번 구현은 BLE 측정 → 사용자 안내/수행 기록 → 관리자 공유 흐름을 연결합니다. 과거 웹 IndexedDB 기록은 자동 이전하지 않습니다. 원본 연속 센서 프레임을 서버에 보관하지 않고 현재 상태와 이벤트를 공유합니다.

## 출처와 검증 경계

- 통신 규격·기존 구현: [br4c3/esp32_telecommunication](https://github.com/br4c3/esp32_telecommunication), 커밋 `3ddc5ec5dc23db07ff2444c75cc1fd77e69b028d`. MIT 고지는 `THIRD_PARTY_LICENSE.txt`에 보존했습니다. 원본의 Firebase 설정·인증정보는 복사하지 않았습니다.
- BLE 연결 라이브러리: [flutter_reactive_ble 공식 문서](https://github.com/PhilipsHue/flutter_reactive_ble). 원본 Flutter 앱의 flutter_blue_plus UI 전체를 복사하지 않고 같은 프로토콜로 새 화면·통신 계층을 구성했습니다.
- 규칙 기준: 기존 `packages/shared/src/care-session.js`. 기본 시간·변화율을 이식했지만 의학적 검증값이 아닙니다.
- 실제 ESP32, Android/iPhone 설치, 권한 팝업, 잠금 전환, 펌웨어 통신은 물리 기기에서 추가 확인해야 합니다. 로컬 테스트 통과는 실물 BLE 성공이나 인터넷 배포 완료를 뜻하지 않습니다.

## 시작 화면 검증

- 첫 실행·완료 저장/복원, 잘못된 코드/다른 기기 필터링, 보정 재시도·연결 끊김, 경고 이후 값 확인 모드, 저장 실패를 자동 테스트합니다.
- QR·바코드에는 기기 코드 문자열만 허용하며 URL을 열지 않습니다. 카메라 권한 거절 시 직접 입력으로 돌아갈 수 있습니다. 스캐너 화면을 닫거나 앱을 떠나면 카메라를 중지합니다.
- QR 라이브러리: [mobile_scanner 7.4.2 공식 문서](https://pub.dev/packages/mobile_scanner/versions/7.4.2). Android 카메라 권한·선택적 카메라 하드웨어, iOS 카메라 사용 설명을 추가했습니다.
- 실제 화면 미리보기: `tool/onboarding_preview_test.dart`에 모의 펌웨어 상태만 주입해 렌더링합니다. 실제 Bluetooth 연결 또는 카메라 스캔 검증이 아닙니다.

```sh
flutter test tool/onboarding_preview_test.dart \
  --dart-define=SEAT_PREVIEW_FONT=/System/Library/Fonts/AppleSDGothicNeo.ttc \
  --dart-define=SEAT_PREVIEW_DIR=/tmp/seat-onboarding-preview
```

- 시작 화면은 원본 프로젝트의 `app/assets/images/cushion.png`를 사용합니다. MIT 고지는 `THIRD_PARTY_LICENSE.txt`에 보존했습니다.
