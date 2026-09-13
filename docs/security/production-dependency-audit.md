# Production dependency audit

Last updated: 2026-07-18

## Scope

Production audits are run for each deployable package with:

```bash
npm audit --omit=dev --audit-level=high --json
```

Packages audited:

- `backend-core-service`
- `dashboards/workspace`
- `dashboards/platform-console`
- `services/chat-ingestion-service`
- `services/webhook-handler-service`
- `services/integration-service`
- `services/file-storage-service`
- `services/media-processing-service`

The repository uses npm with one `package-lock.json` per deployable package.

## Baseline before remediation

| Application | Critical | High | Total production findings | Main vulnerable families |
| --- | ---: | ---: | ---: | --- |
| `backend-core-service` | 0 | 13 | 23 | NestJS, TypeORM, `multer`, `ws`, `jws`, Lodash, `validator` |
| `dashboards/workspace` | 1 | 2 | 4 | Next.js, `ws` via Socket.IO client |
| `dashboards/platform-console` | 1 | 4 | 8 | Next.js, Lodash, glob/minimatch/picomatch |
| each Nest sidecar | 0 | 5 | 10 | NestJS, `multer`, Lodash, `path-to-regexp` |

## Remediation applied

| Family | Remediation | Affected applications | Reachability |
| --- | --- | --- | --- |
| Next.js | Upgraded both dashboards to `next@15.5.20`. | Workspace, platform-console | Public app router, route handlers, prerender/server-render paths. |
| NestJS | Upgraded Nest runtime packages to `11.1.28` and `@nestjs/config` to `4.0.4`. | Backend, all sidecars | API request routing, DI, guards, interceptors, file upload integration. |
| Swagger | Upgraded `@nestjs/swagger` to `11.4.6`. | Backend | Backend documentation route; transitive Lodash/path matching. |
| TypeORM | Upgraded to `typeorm@0.3.31`. | Backend | Repository save/update, query builders, migrations. |
| Upload parsing | Upgraded transitive/direct `multer` to `2.2.0` through patched Nest platform package and backend lockfile. | Backend, all sidecars | Multipart parsing/upload attack surface. |
| WebSocket stack | Upgraded backend Socket.IO stack to `socket.io@4.8.3`, `ws@8.21.1`; workspace overrides `engine.io-client@6.6.6` and `ws@8.21.1`. | Backend, workspace | Authenticated realtime and Socket.IO client transport. |
| JWT/JWS | Upgraded `jws` to `3.2.3` through the backend lockfile. | Backend | JWT signing/verification chain via `jsonwebtoken`. |
| Lodash | Upgraded/overrode Lodash to `4.18.1` where production transitive parents still resolved vulnerable versions. | Backend, sidecars, platform-console | Config/swagger/chart utility paths. |
| Glob/minimatch/picomatch/yaml | Added narrow platform-console overrides for Tailwind/Recharts production transitive dependencies. | Platform-console | Build/runtime package graph; no application logic changed. |

## Overrides

### `dashboards/workspace`

- `engine.io-client@6.6.6`
- `ws@8.21.1`

Reason: `socket.io-client@4.8.3` is the current direct package, but its transitive lockfile resolved vulnerable `engine.io-client@6.6.5` and `ws@8.20.1`. The override keeps the same major/minor family and moves only to patched compatible releases.

Removal plan: remove when `socket.io-client` publishes a release that resolves these patched transitive versions without overrides.

### `dashboards/platform-console`

- `brace-expansion@2.0.3`
- `glob@10.5.0`
- `lodash@4.18.1`
- `minimatch@9.0.9`
- `picomatch@2.3.2`
- `yaml@2.8.3`

Reason: production advisories were reachable through `recharts@2.15.0` and `tailwindcss@3.4.17` transitive dependencies. The overrides stay within compatible major versions and avoid a Tailwind major migration in this security task.

Removal plan: remove after upgrading the direct parents (`recharts`/Tailwind stack) to releases that resolve patched transitive dependencies naturally.

## Result after remediation

`npm run ci:audit` now passes the high/critical gate:

| Application | Critical | High | Remaining lower-severity findings |
| --- | ---: | ---: | ---: |
| `backend-core-service` | 0 | 0 | 1 low |
| `dashboards/workspace` | 0 | 0 | 2 moderate |
| `dashboards/platform-console` | 0 | 0 | 2 moderate |
| all sidecars | 0 | 0 | 0 |

No critical or high production advisory is excepted.

## Follow-up

- Moderate Next/PostCSS advisory remains in both dashboards because npm currently reports it through `next@15.5.20`; no high/critical gate failure remains.
- Low backend advisory remains below the ZAY-P0-005 release-blocking threshold.
- Continue to run `npm run ci:audit` in CI and remediate new high/critical production advisories before release.
