# 우리가 서로의 별이 될 때

> 만나지 않아도 연결될 수 있고, 말하지 않아도 함께 머물 수 있는 작은 밤하늘.

상명대학교 또래상담 부원들을 위해 시작한 별자리 공간입니다. 각자 자신의 별을 남기고, 서로의 별에 작은 빛을 보내고, 시간이 흐르면 별들이 자연스럽게 연결됩니다. 처음 들어오는 곳은 **또래상담 별자리**이며, 공개·비공개 별자리 방도 만들 수 있습니다.

- **지향점:** 참여를 강요하지 않는 연대감. 혼자 방문해도 아름다운 풍경과 자연스러운 별빛.
- **주요 기능:** Canvas 2D 밤하늘과 나무, 별 남기기·연결·빛 보내기, 유성우, 테마 4종, 공개/비공개 별자리 방, 사진 저장.
- **기술:** Next/Vinext, TypeScript, Cloudflare Workers, D1.
- **실행:** Node.js 22.13 이상에서 `npm ci` 후 `npm run dev`.
- **빌드:** `npm run build`.
- **프로젝트의 방향과 현재 한계:** [PROJECT_VISION.md](PROJECT_VISION.md).

**주의:** 현재 배포된 서비스는 소수 인원 검토 단계입니다. 비공개 방의 초대 링크는 신원 인증이 아닙니다. 서버에는 별 이름과 위치·색상 및 빛의 기록이 저장됩니다. 소원의 원문은 방문자의 브라우저에만 보관됩니다.

### 참여·삭제·신고 정책

- **별 정원:** 기본 또래상담 하늘 **500개**, 별도로 만든 각 하늘 **300개**. 브라우저 기기 토큰 하나당 **각 하늘에 별 하나**를 남길 수 있습니다. 정원은 DB 저장 시점에 원자적으로 적용됩니다.
- **방 정원과 권한:** 브라우저 토큰 하나당 방 **최대 3개**. 방 삭제는 **생성 당시의 소유자 토큰**이 서버에서 일치할 때만 가능합니다. 방을 삭제하면 해당 방의 별·빛·접속 정보·신고가 함께 삭제되고 되돌릴 수 없습니다.
- **특별한 연결선:** 방장은 먼저 자신의 별을 남긴 뒤 다른 별을 선택하여 연결선 **하나**를 남길 수 있습니다. 다른 별을 선택하면 기존 연결을 교체하며, 방장만 연결을 해제할 수 있습니다. 기본 하늘의 자동 연결선은 별이 추가되어도 유지되는 방식입니다.
- **별 삭제:** 자신의 별은 본인이 삭제할 수 있습니다. 별도 방의 방장은 방 안의 부적절한 별도 삭제할 수 있습니다. 삭제된 별에 연결된 빛과 신고도 함께 삭제됩니다.
- **신고:** 다른 사람의 별이나 공개 방을 욕설·괴롭힘, 광고·도배, 개인정보, 기타 사유로 신고할 수 있습니다. 동일한 대상을 중복 신고할 수 없고, **하나의 기기 토큰당 24시간 최대 6회**로 제한됩니다. 신고만으로 자동 삭제되지 않습니다.
- **관리:** 방장은 `방 목록 → 관리`에서 자신의 방에 접수된 별 신고를 확인하여 필요한 경우 삭제할 수 있습니다. 신고자의 토큰·신원은 화면에 공개되지 않습니다. 기본 또래상담 하늘의 신고와 *공개 방 자체에 대한 신고*는 현재 별도 관리자 화면이 없으므로 운영자가 Cloudflare D1에서 확인해야 합니다.
- **익명성의 한계:** 회원가입 없이 로컬 기기에 저장된 랜덤 토큰으로 소유자를 구분하므로, 브라우저 데이터를 지우거나 기기를 바꾸면 자신의 방·별을 관리할 권한을 잃을 수 있습니다. 별도 기기를 통한 중복 참여나 악성 이용을 완전히 방지하는 실명 인증은 없습니다. 운영 규모가 커지면 별도 인증/Turnstile, 복구 수단, 운영자 검토 화면을 추가해야 합니다.

운영자용 신고 조회 예시(읽기 전용):

```sql
SELECT r.target_type, r.target_id, r.reason, r.room_id, r.created_at,
       COALESCE(s.name, rs.name, rm.name) AS reported_name
FROM reports r
LEFT JOIN stars s ON r.target_type = 'star' AND r.target_id = s.id
LEFT JOIN room_stars rs ON r.target_type = 'star' AND r.target_id = rs.id
LEFT JOIN rooms rm ON r.target_type = 'room' AND r.target_id = rm.id
ORDER BY r.created_at DESC LIMIT 100;
```

## Cloudflare Workers + D1 배포

이 저장소는 별도의 Cloudflare 계정으로 이전 배포할 수 있도록 `wrangler.cloudflare.jsonc`를 포함합니다. **현재 ChatGPT Sites에서 실행 중인 D1과 사용자 Cloudflare 계정에 새로 만드는 D1은 서로 다른 데이터베이스**입니다. 새 DB에는 기존 별 기록이 자동으로 복사되지 않습니다.

1. Cloudflare 계정으로 `npx wrangler login`을 실행합니다. GitHub Actions 배포를 사용할 경우 Cloudflare API 토큰과 계정 ID를 별도 저장소 비밀 변수로 구성해야 하며 코드에 넣지 않습니다.
2. **D1은 이미 생성되었습니다.** `webecomeeachotherstar-db`의 ID `00907ab5-1365-42f8-9d3e-98009603b65d`는 `wrangler.cloudflare.jsonc`에 반영되어 있습니다. 같은 DB를 다시 만들지 마세요.
3. `0000_fluffy_gunslinger.sql`부터 `0004_amazing_killraven.sql`까지의 테이블·인덱스·연결선 컬럼과 `d1_migrations` 기록은 원격 DB에 적용되었습니다. 이후 새로운 마이그레이션을 추가한 경우에만 `npx wrangler d1 migrations apply webecomeeachotherstar-db --remote --config wrangler.cloudflare.jsonc`를 실행하세요.
4. `npm run build` 후 `npx wrangler deploy --config wrangler.cloudflare.jsonc`로 Workers와 정적 자산을 배포합니다.

`wrangler.cloudflare.jsonc`는 **사용자 Cloudflare 계정용** 설정입니다. 기존 Sites 배포는 `.openai/hosting.json`과 사이트 전용 빌드 절차를 계속 사용하므로 서로를 덮어쓰지 않습니다. `--remote`가 붙은 D1 명령은 실제 원격 DB를 변경하므로 반드시 대상 DB 이름을 확인하고 실행하세요.

---

## 개발 환경 참고

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git and `tar` (including Windows `tar.exe`) are required for publishing; portable publication does not require Bash

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

Publish archives outside the source checkout or under its ignored `outputs/` directory. Local `.env*`, `.dev.vars*`, TypeScript build state, and tool runtime directories are ignored; keep the hosting manifest, migrations, and authored scripts in source control.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For managed Linux browser QA, follow the Sites skill's managed preview reference. The daemon runs the project's Vite dev script with `--host 0.0.0.0 --port 4173 --strictPort`; use the CLI's returned URL. The ignored local profile survives the daemon's cleared environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `worker/index.ts` is the production Worker entrypoint and preserves request-scoped connector bindings
- `scripts/vite/` contains the maintained Vite integrations and the vendored Sites plugin license
- `scripts/connector-preview/` contains the local connector preview Worker and session helpers
- the remaining `scripts/` files select execution profiles and run installation, development, and builds; the plugin's helpers orchestrate the Sites lifecycle
- `dist/` contains generated deployment output; `.vinext/`, `.wrangler/`, and `.sites-runtime/` contain ignored local tool state
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
