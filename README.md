# QR 회의 참석자 명부 + 노동 이슈 기간별 리포트 시스템

## 기능
- QR 기반 참석 등록 및 명부 자동 생성
- 명부 출력(인쇄), CSV 다운로드
- 저장된 참석자 이메일 기반 리포트 발송
- 노동 이슈 수집 항목
  - 법령 개정사항
  - 판례
  - 지침
  - 행정해석
  - 노동위원회 판정례
  - 개정 설명자료
- 월간 신규 취합 저장
- 기간별 조회/리포트
  - 월간(month)
  - 분기(quarter)
  - 반기(half)
  - 연도(year)
- 카테고리별/분야별 집계 표시

## 실행
```bash
npm install
npm start
```

- 관리자 페이지: `http://localhost:3000/`
- 참석자 입력: 관리자 페이지에서 생성한 QR URL

## 월간 운영 흐름
1. 관리자 화면에서 `월간 신규 수집` 실행 (`YYYY-MM`)
2. 기간 유형/기간 값 선택 후 `기간 리포트 조회`
3. 필요 시 `선택 기간 발송`
4. `발송 로그` 확인

## 자동 발송
- 매월 자동 실행(기본: 매월 1일 08:00 KST)
- 자동 실행 시 전월 데이터를 수집 후 월간 리포트 발송
- 수시 자동 발송(기본: 6시간마다 현재월 기준 발송)
- 관리자 화면의 `수시 즉시 발송(현재월)` 버튼으로 수동 즉시 발송 가능

## 환경변수
- `PORT` (기본 `3000`)
- `BASE_URL` (QR URL 기준 주소)
- `AUTO_REPORT_ENABLED` (`true`/`false`, 기본 `true`)
- `MONTHLY_REPORT_CRON` (기본 `0 9 1 * *`)
- `FREQUENT_REPORT_ENABLED` (`true`/`false`, 기본 `true`)
- `FREQUENT_REPORT_CRON` (기본 `0 */6 * * *`)
- `FREQUENT_REPORT_PERIOD_TYPE` (`month|quarter|half|year`, 기본 `month`)
- `MAIL_PROVIDER` (`korea` 기본)

### 이메일 SMTP
- 코리아 메일 기본값: `smtp.korea.com:465`, SSL(`SMTP_SECURE=true`)
- `SMTP_HOST` (미설정 시 `MAIL_PROVIDER=korea` 기본값 사용)
- `SMTP_PORT`
- `SMTP_SECURE` (`true`/`false`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## 기간값 형식
- month: `YYYY-MM` (예: `2026-04`)
- quarter: `YYYY-Qn` (예: `2026-Q2`)
- half: `YYYY-Hn` (예: `2026-H1`)
- year: `YYYY` (예: `2026`)

## API
- `POST /api/news/collect-monthly` 월간 수집
- `GET /api/reports/available-periods` 조회 가능한 기간 목록
- `GET /api/reports/period?type=...&value=...` 기간별 리포트 데이터
- `POST /api/reports/send-period` 선택 기간 발송
- `POST /api/reports/send-now` 수시 즉시 발송(현재월)
- `GET /api/reports/logs` 발송 로그

기존 참석자 명부 API도 그대로 사용 가능합니다.
