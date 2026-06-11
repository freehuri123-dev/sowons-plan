# Sowon's Happy Plan

가족 일정 프로토타입입니다. 정적 HTML 화면은 `prototype/`에 있고, Vercel 배포 시 `/api/state` 함수가 Postgres에 전체 일정 상태를 저장합니다.

## 로컬 실행

```bash
npm install
npm start
```

브라우저에서 `http://127.0.0.1:3001/start.html`을 엽니다. 로컬 정적 서버에서는 DB API가 없으면 자동으로 `localStorage`에 저장합니다.

## Vercel 배포 전 설정

Vercel 프로젝트 환경변수에 아래 값을 추가해야 DB 저장이 동작합니다.

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
```

Vercel Postgres, Neon, Supabase 등 Postgres 호환 DB의 connection string을 사용할 수 있습니다. 배포 후 `/api/state`가 처음 호출될 때 `family_app_state` 테이블이 자동으로 생성됩니다.

## 확인

```bash
npm test
```
