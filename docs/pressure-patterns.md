# 채택 도면 v2의 압력 패턴 추정

현재 배치는 seat-care-drawing-20261007-v2, 규칙은 pressure-pattern-rules-v2입니다. [현재 좌표·계산·초기 임계값·미확정 사항](layout-v2-2026-10-07.md)이 구현 기준입니다. C1은 중앙후방입니다. 위치 채택은 실물 제작·하중 보정·임상 검증 완료가 아닙니다. 올바른 자세·척추 정렬·욕창 위험·안전 시간이나 미래 위험을 판정하지 않습니다.

## 직접 시연

1. 사용자 http://127.0.0.1:4174, 관리자 http://127.0.0.1:4173을 엽니다.
2. 기기 → 새 배치 기준 등록. 10초 이상 안정된 유효 입력을 모으고 약 2초 더 기다립니다. 이전 배치 기준은 승계되지 않습니다.
3. 시연 도구 → 시연 제어 → 왼쪽/오른쪽/앞쪽/뒤쪽 이동 또는 C1 중앙후방을 누릅니다. 양쪽 추정과 근거를 확인합니다.
4. 누락·지연 시험에서는 판단 불가와 지도 숨김을 확인합니다. 기준 분포를 누르면 유효한 연속 입력을 확인한 뒤 복구합니다.
5. 새 기록 v2에는 배치 ID·이름별 좌표·채널 매핑을 저장합니다. 기존 v1은 배치 미기록 안내와 함께 숫자만 재생하며 지도를 숨깁니다. 과거 기록을 현재 추정이나 기준 등록에 주입하지 않습니다.

## 계산과 표시

전체 5개 상대값과 채택 좌표로 가중 평균 X/Y를 계산하므로 C1은 후방 이동에도 반영됩니다. 실제 하중·센서 면적 보정이 없으므로 물리적 압력 중심으로 검증된 값이 아닙니다. 근거의 X/Y 이동은 전체 폭/깊이 대비 %, C1 비중 변화는 %p입니다. 요약의 좌우 비율은 외곽 4채널만 사용하며 C1을 한쪽에 배정하지 않습니다. 임계값은 공학적 초기값이고 확률·정확도·의료 안전 기준이 아닙니다. 지도는 5점 보간이며 미측정 위치의 실제 압력이 아닙니다.

## 향후 실제 관찰 데이터 검증

`packages/shared/src/pattern-dataset.js`와 `tools/validate-pattern-dataset.mjs`는 로컬 데이터 구조 검증 및 규칙 재생용입니다. 데이터를 수집하거나 전송하지 않습니다. 테스트 데이터는 코드로 만든 합성 데이터입니다.

JSON 형식: `format: seat-care-pattern-dataset`, `version: 1`, `sessions: [...]`. 세션 필드:

- `id`, `partition`(development/holdout), `participantKey`(P001 형식의 가명), `day`(YYYY-MM-DD)
- `layout`(엔진 배치 계약), `calibrationStartAt`(같은 시간축의 밀리초)
- `frames`: `receivedAt`, `packet`, `qualityIssue`(inspectPacket의 사유 또는 null), `observation`
- `observation`: `label`(PATTERN_LABELS 키 또는 null), `origin`(가상 scenario / 실측 independent-observation), `episodeId`, `movementIntent`(unknown/reference/pressure-relief/task)
- `packet`: source, layoutId, streamId, channelIds, values, sampledAt, sequence, sensorStatus.

`node tools/validate-pattern-dataset.mjs /path/to/local.json`으로 검증합니다. 최대 16MiB, 100세션, 100,000프레임. 참가자와 날짜가 개발/보류 검증에 겹치면 거부합니다. 관찰 라벨은 모델 출력으로 자동 생성하면 안 됩니다. 오류 입력은 qualityIssue와 null 라벨로 보존합니다. 도구는 라벨 있는 프레임의 추정/보류 수와 혼동표를 반환합니다. 프레임 간 상관이 있으므로 이 숫자는 독립 참가자 수나 임상 정확도가 아닙니다. 도구는 독립 관찰이 실제 수행됐는지 인증할 수 없습니다.

실측 전 결정할 사항: 센서 모델·물리적 위치·쿠션 위/아래·정규화 절차, 전문가와 합의한 개인 기준 및 관찰 라벨, 동의·보관 절차. 이후 대상 사용자와 쿠션·체형·설치 오차·장시간 드리프트 조건에서 독립 관찰자를 두고 참가자/날짜/에피소드 단위로 평가해야 합니다. 보류율, 방향별 혼동, 지연, 오경보, 장애 감지 및 개인별 편차를 함께 보고하고 보류 검증 데이터에 맞춰 임계값을 반복 조정하지 않습니다. 실측 수집·사용자 모집은 이번 작업에 포함하지 않습니다.

관련 자료: [2023 휠체어 압력·체중 이동 도구 사용성 연구](https://pmc.ncbi.nlm.nih.gov/articles/PMC10648002/)는 센서 위치·수와 목적이 다른 도구의 사용성을 다룹니다. 이를 본 구현의 자세 판정 정확도 근거로 사용하지 않습니다. [MSKTC 압박손상 예방 자료](https://msktc.org/sci/factsheets/preventing-pressure-sores)는 전문적인 개인별 평가를 참고하기 위한 자료이며 앱의 임계값 출처가 아닙니다.

## 검증 명령

`npm test`, `npm run check`. 자체 시연 서버에서만 `node tools/pattern-smoke.mjs`, `node tools/smoke.mjs`. 통합 검사는 시연 상태를 초기화하므로 발표 중 실행하지 마세요.
