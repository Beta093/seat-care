# 로컬 시연 데이터 계약

`packages/shared/src/monitor.js`가 상태와 전이의 기준입니다. 양 웹은 `packages/shared/src/client.js`로 같은 데이터를 조회합니다.

## 조회

`GET /api/state` → JSON

- `source`: 현재 `demo`만 사용. 실측으로 표기하지 않음.
- `score`: 시연 위험 점수 0~100
- `values`: 내부 가상 상대값 5개. 이름 L1/R1/L2/R2/C1에 연결한다. C1은 중앙후방이다. 내부 배열 직렬화 순서는 실제 하드웨어 채널/GPIO 순서가 아니다.
- `seconds`: 동일 압력 누적 시간
- `mode`: `stable | calibrating | accumulating | recovering`
- `scenario`: `normal | caution | warning | recovery`
- `baseline`, `calibration`: 기준 등록 완료 여부와 진행 초
- `ack`: 현재 경고에 대한 관리자 확인 여부
- `events`: 시간, 유형, 점수, 설명, 개선 전 점수·감소율
- `updatedAt`: 시연 서버의 최근 상태 갱신 시각

## 명령

`POST /api/command`, `Content-Type: application/json`

```json
{"action":"accumulate"}
```

모바일: `calibrate`, `cancel-calibration`, `accumulate`, `recover`, `auto`, `normal`, `caution`, `warning`, `reset`.
관리자: `acknowledge`만 허용. 확인은 위험도를 변경하지 않음.

명령과 상태는 로컬 개발 서버 메모리에서 처리됩니다. 250ms 간격으로 조회하며 실패 시 마지막 값과 연결 끊김 상태를 표시합니다. 화면 별 포트 제한은 개발 편의를 위한 것이며, 실제 운영 권한 검증이 아닙니다.

## 실제 연결 전 필요한 것

센서 통신 규격·실제 장착 검증·개인별 기준 압력, 위험 점수 산출 및 해소 판정, 인증·인가, 원격 통신, 영속 저장, 외부 알림 전달·실패 처리. 채택 도면 좌표와 실물 장착 검증은 별개입니다. 현재 명령형 시연을 실측 처리로 오인하지 않도록 실제 입력 경로와 `source` 구분부터 구현해야 합니다.


## 압력 패턴 확장

상태에 `pattern` 스냅샷을 추가했습니다. `version`, `source`, `layout`, `sample`, `baseline`, `calibration`, `calibrationError`, `result`를 포함합니다. `result.status`는 unknown/estimated이며 code/label/reason/delta를 제공합니다. 확률이나 정확도 필드는 없습니다. 기준은 메모리에만 저장되고 출처·스트림·배치와 결합됩니다. 보고서에는 현재 스냅샷이 포함됩니다. 기존 기록 파일 v1에는 추정 결과나 기준이 포함되지 않습니다.

모바일 시연 명령: pattern-reference, pattern-left, pattern-right, pattern-front, pattern-rear, pattern-center-rear, pattern-right-rear, pattern-zero, pattern-missing, pattern-stale, pattern-fault, pattern-invalid, pattern-repeat, pattern-saturated. 관리자 명령은 기존 acknowledge만 허용합니다. 실제 센서 입력 API는 없습니다. 자세한 계약과 오프라인 관찰 데이터 구조는 [압력 패턴 문서](pressure-patterns.md)를 참고하세요.


## 로컬 서버 기록 및 화면 복귀 (후속 수정)

모바일 포트에만 POST /api/recording을 추가했다. 요청은 {action: start|status|stop, id: 브라우저가 생성한 UUID}. 응답은 id, active, count, durationMs, inputIssue, skippedFrames, error, recording을 포함한다. recording 데이터는 stop에서만 반환한다. 동일 id의 start/stop은 멱등이며 다른 id의 세션은 분리된다. 관리자 포트는 403으로 거부한다. 기존 same-origin 검사와 요청 크기 제한을 적용한다. 인증된 운영 서비스가 아닌 localhost 시연 전용이다.

서버의 실제 가상 입력 tick에서 최소 250ms 간격으로 유효 프레임을 수집한다(100ms tick 환경에서는 대략 300ms). 화면 조회 타이머와 독립적이다. 같은 값도 새 입력이면 저장하고, 누락·지연·중복·오류 입력은 건너뛴다. 과거 구간을 보간·복원하지 않는다. 세션당 최대 10분/2401프레임, 동시 활성 4개, 보관 16개, 20분 후 삭제다. 서버 재시작 시 사라진다. 클라이언트 start 응답 유실 시 같은 id로 재시도한다. stop 응답 유실 시 다시 stop할 수 있다. 새 기록은 v2로 배치 ID·이름별 좌표·채널 ID를 저장한다. v1은 숫자만 재생하며 배치 미기록 안내와 함께 지도를 숨긴다.

client.js는 visibilitychange/focus/pageshow/online/hashchange 시 현재 상태를 즉시 다시 조회한다. 숨김·복귀 시 기존 조회를 취소하며 오래된 응답은 세대와 요청 식별로 차단한다. 숨긴 탭은 화면 조회를 쉬어도 서버 기록은 계속된다. 지연 판정 기준 1500ms는 늘리지 않았다.


## 채택 배치 v2 계약

현재 배치 ID는 seat-care-drawing-20261007-v2, 규칙 버전은 pressure-pattern-rules-v2다. layout.points는 L1/R1/L2/R2/C1의 이름별 정규 좌표이며 도면 버전과 정확히 일치해야 한다. packet의 channelIds/values 쌍은 배열 순서가 달라도 이름으로 매핑한다. 실제 하드웨어 숫자 순서나 GPIO는 지정하지 않는다. baseline은 규칙 version, layoutId, geometrySignature, channelIds, source, streamId를 저장한다. 이전 버전/좌표는 재등록 대상으로 처리한다.

features.right/rear는 전체 5점의 상대값 가중 평균 X/Y, delta.right/rear는 기준 대비 좌표 변화다. 화면 단위는 %폭/%깊이이며 C1 비중 변화 delta.center만 %p다. 새 기록 v2는 layout.id/channelIds/points를 보존한다. v1의 배치 정보는 null이고 지도는 표시하지 않는다. 자세한 좌표와 미확정 사항은 layout-v2-2026-10-07.md를 따른다.
