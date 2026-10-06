# Tower Race

PC 브라우저용 2D 탑다운 1대1 타워 레이스 게임입니다. 주사위로 층을 이동하고, 각 층의 실시간 던전을 클리어하며 100층 최종보스를 먼저 처치하는 것이 목표입니다.

## 기술 스택

- 브라우저 렌더러: HTML Canvas 2D + TypeScript
- 클라이언트 번들러: Vite
- 세션 서버: Node.js + TypeScript
- 실시간 전송: WebSocket (`ws`)
- 계약 검증: Zod
- 테스트: Vitest
- 구조: `apps/client`, `apps/server`, `packages/shared`

## 실행

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

클라이언트는 Vite 개발 서버, 세션 서버는 `ws://localhost:8787`에서 실행됩니다. 구현 초기에는 방 코드 대전과 CPU 대전을 같은 세션 상태 머신으로 검증합니다.

## 로컬 플레이테스트

1. `pnpm install` 후 `pnpm dev`를 실행합니다.
2. 브라우저에서 `http://localhost:5173`을 엽니다.
3. 혼자 플레이하려면 `CPU 대전`과 난이도를 선택하고 `준비 완료`를 누릅니다.
4. 1대1 대전은 한 브라우저에서 `방 만들기`를 누른 뒤 표시된 5자리 방 코드를 다른 브라우저 창에 입력합니다. 두 참가자가 모두 `준비 완료`를 누르면 1P부터 시작합니다.
5. 주사위는 서버가 결정하고, 전투 중에는 WASD·마우스 클릭·Space·E를 사용합니다. 상점 재고는 방 전체가 공유되고, 구매 후 세 번의 플레이어 턴 뒤 다시 채워집니다.

## 검증과 결정적 픽스처

```bash
pnpm validate:content
pnpm test
pnpm typecheck
pnpm build
```

층 블루프린트와 상점 목록은 세션 시드에서 파생됩니다. 동일한 시드와 층 번호는 같은 방·장애물·적·상자 후보를 재현하고, 각 플레이어의 하트·코인·적 처치·상자 개봉 상태는 별도로 유지됩니다. `packages/shared/src/session.test.ts`에는 100층 상한, 보스 우선순위, 3층 사망 페널티, 유령, 공유 상점, 내구도, 버프 조합 픽스처가 있습니다.

## 범위

현재 첫 버전은 PC 브라우저를 대상으로 하며, 모바일 입력·공개 매칭·계정 저장은 포함하지 않습니다. 세션은 메모리에만 존재하므로 서버가 재시작되면 방과 진행 상태가 사라집니다.
