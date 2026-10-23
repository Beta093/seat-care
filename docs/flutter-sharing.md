# Flutter 사용자 앱 ↔ 관리자 웹 공유

## 구성

```text
ESP32 (기존 펌웨어)
  └─ BLE → apps/worker-flutter (사용자 앱)
              ├─ 기기 내 이벤트 기록
              └─ HTTPS /api/telemetry → 비공개 Vercel Blob
                                           └─ /sensor/ 관리자 웹
                                                └─ 안내 확인 → 사용자 앱
```

`api/telemetry.js`와 `packages/shared/src/telemetry.js`는 실제 센서 전용이며 기존 `/api/rehearsal` 시연 저장소와 분리합니다. 기존 관리자 메인 화면에는 ‘실제 센서 공유’ 링크만 추가됩니다. 사용자 웹은 지금도 기존처럼 기기 내 기록을 사용하며 새 공유 API로 자동 업로드하지 않습니다.

## 서버 준비 (아직 배포하지 않음)

기존 관리자 Vercel 프로젝트에 다음 서버 환경변수를 설정한 후 배포해야 합니다.

- `BLOB_READ_WRITE_TOKEN`: 비공개 Blob 접근 토큰. 기존 시연용 저장소를 써도 경로가 분리됩니다.
- `SENSOR_SHARE_SECRET`: 시연 조종 키와 별개인 무작위 32바이트 이상 비밀값. 앱·웹 번들에 넣지 않습니다.

로컬에 발급용 비밀값을 만들려면 저장소 루트에서 실행합니다. 파일은 Git/배포에서 제외됩니다.

```sh
node -e "require('fs').writeFileSync('.env.sensor.local','SENSOR_SHARE_SECRET='+require('crypto').randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o600})"
```

이 `SENSOR_SHARE_SECRET`과 서버 값이 같아야 합니다. 비밀값 자체를 사용자나 관리자에게 전달하지 않습니다.

```sh
node --env-file=.env.sensor.local tools/sensor-invite.mjs https://YOUR-ADMIN-HOST
```

`.env.sensor-invites.local`에 사용자용/관리자용 초대와 공유방 ID가 저장됩니다. 파일 덮어쓰기를 막기 때문에 추가 발급은 세 번째 인자에 다른 `.env.*.local` 파일명을 지정합니다. 사용자마다 새 공유방을 발급하고 **각 역할의 링크만** 해당 사람에게 전달합니다. 유효기간은 발급 후 30일입니다.

앱은 사용자 초대의 서버에 먼저 인증 조회를 하고, 사용자가 공유를 켜야 업로드를 시작합니다. 관리자는 관리자 초대 URL을 브라우저에서 열거나 `/sensor/`에 붙여 넣습니다. URL fragment의 토큰은 서버 URL 로그에 들어가지 않으며, 관리자 페이지는 주소에서 제거한 뒤 해당 탭의 sessionStorage에 보관합니다.

이 버전은 계정 로그인 대신 **링크 보유 권한 방식**입니다. 사용자는 자기 방 조회·업로드, 관리자는 해당 방 조회·이벤트 확인만 가능합니다. 여러 근로자 통합 명단/조직 관리자 권한은 포함하지 않습니다. 공유방은 탭 단위로 선택합니다. 초대 유출 시 서버 비밀값을 교체하면 기존 모든 초대가 무효화됩니다. 개인 초대별 중도 취소·계정 접근 감사는 아직 별도 구현 대상입니다.

## 로컬 검증

```sh
npm run build
node tools/sensor-preview.mjs
```

- 관리자 주소: `http://127.0.0.1:4188/sensor/`
- 로컬 전용 초대: `.env.sensor-preview.local`
- 데이터는 프로세스 메모리에만 보관하고 종료 시 사라집니다. 실제 인터넷 서버와 연결하지 않습니다.
- 포트 변경: `PORT=4189 node tools/sensor-preview.mjs`
- Android 에뮬레이터의 Flutter 디버그 앱에서는 사용자 초대 URL 호스트를 `10.0.2.2`로 바꿉니다. 디버그 매니페스트만 HTTP를 허용합니다. 릴리스 앱은 HTTPS를 사용합니다.
- 실물 휴대폰은 localhost에 접근할 수 없으므로 HTTPS 서버 준비 후 시험하세요.

Flutter 패키지에서 다음 명령은 실제 HTTP 클라이언트를 통해 모의 센서 입력 업로드 → 관리자 조회 → 확인 응답 → 사용자 조회를 검증합니다. 원격 호스트 전송을 거부하므로 배포 공유방의 실제 데이터에 영향을 주지 않습니다.

```sh
cd apps/worker-flutter
# 경로는 이 저장소의 절대 경로로 지정합니다.
dart run tool/sharing_smoke.dart /ABSOLUTE/REPOSITORY/.env.sensor-preview.local
```

## 데이터 계약과 저장

- `GET /api/telemetry`: `Authorization: Bearer <역할 토큰>`으로 해당 방의 snapshot/events/acknowledgements 조회.
- 사용자 `POST`: `action: upload`, `version: 1`, `requestId`, `snapshot`, `events`(최대 50개).
- snapshot: `source: sensor`, `layoutId`, `sessionId`, `sequence`, `at`, `quality`, `connected`, `device`, `values`(5개), `baseline`(5개 또는 null), `bias`(채널 ID).
- 이벤트: `id`, `sessionId`, `source`, `type`, `at`, `detail`. 같은 ID는 처음 저장된 내용만 유지합니다.
- 관리자 `POST`: `action: acknowledge`, `eventId`. 기존 도움 요청·알림만 확인할 수 있고 센서값 변경은 거부합니다.
- 토큰 HMAC 검증, 방별 경로 분리, 64KB 요청 한도, 채널/숫자/배치/출처 검증, ETag 조건부 갱신 및 충돌 재시도.
- 동일 세션의 낮은 sequence와 오래된 다른 세션은 현재 상태를 덮어쓰지 못합니다. 데이터가 15초 이상 지나거나 연결이 끊기면 관리자 화면에서 현재 센서값을 감춥니다.
- 이벤트는 최근 90일/최대 2,000개만 조회·유지합니다. 기록 갱신 시 오래된 내용을 잘라 저장하며, 별도 일괄 삭제 스케줄러는 없습니다. 저장소 전체 원본 프레임/일별 통계 아카이브는 만들지 않습니다.
- 앱은 공유 시작 이전 로컬 기록을 소급 전송하지 않습니다. 공유를 끄면 대기 큐를 비우고 전송을 멈추지만 이미 전송된 서버 기록은 남습니다.
- 실패한 이벤트 큐는 재시작 후에도 같은 공유방으로 재시도합니다. 공유방 변경 시 큐를 비워 이전 상대의 기록을 새 상대에게 보내지 않습니다.
- 사용자 기기 시각을 기록 시각으로 사용합니다. 기기 시간을 자동 설정으로 유지하세요. 극단적 미래 시각과 90일보다 오래된 이벤트는 거부합니다.

## 검증 결과와 남은 작업

2026-10-23 로컬에서 기존 웹+공유 API Node 테스트 127개, 구문 검사, 웹 빌드, Flutter 정적 분석(경고·오류 없음), 단위/위젯 테스트 11개와 한국어 화면 렌더링 검증 1개, Dart HTTP 클라이언트 ↔ Node 서버 왕복을 검증했습니다. 브라우저에서 5채널값·도움 기록·관리자 확인과 15초 후 현재값 표시 중지를 확인했습니다. 시험 패킷은 실물 측정값이 아닙니다.

APK/IPA 빌드, 실물 BLE 수신, 실제 서로 다른 네트워크의 기기 공유는 미검증입니다. 인터넷 공유를 위해서는 위 서버 변수 설정과 배포가 필요합니다. 백그라운드 BLE 및 OS 알림은 구현하지 않았습니다.
