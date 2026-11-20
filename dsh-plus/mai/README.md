# dsh-project-check — development increment

Independent TypeScript ESM plugin under the repository's `dsh-plus/mai/` directory. **Not a finished project-check release.** Discovery is independently available with tools/fs. With the existing approval/subprocess/sandboxPolicy/sandbox services mounted, the increment also registers preview/run/report. Source implementation and development tests are not evidence of completed project checks or business acceptance.

## Implemented

- Cordis plugin `name` / `inject` / `apply` and tool registration with canonical JSON and Markdown projection.
- Read-only Node metadata access through `ctx.fs`, trusted deployment `readRoot`, containment checks, regular-file checks, fatal UTF-8 decoding and 1 MiB read limit.
- Sorted arbitrary candidate script names and configured task labels through a conservative safety projection; canonical project path/name, task timeout/argument counts, report version, unique discovery run ID and timestamp. Discovery never returns script bodies or argument values. Preview must show exact safe arguments for approval, or refuse the entire plan. Discovery always remains `inconclusive` with explicit evidence gaps.
- Strict v1 configuration validation with immutable task copies, safe error code/field/index, validated task count, and missing/valid/invalid configuration status.
- Package-manager declaration checks against npm 11.16.0 and fixed conflicting lock-entry detection (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`), without reading lock contents or following their links. A declaration is not proof of an installed/verified executable.
- An explicit absolute project path, or the calling session's cwd when omitted. Relative explicit paths are not supported in this increment.
- No report files, export tool, telemetry or automatic project dependency installation.

The deployment `readRoot` is mandatory and must be an absolute path. It is a plugin-level read boundary, not a replacement for host permission policies. Do not mount the bare local filesystem as a way to bypass an existing deployment's restrictions.

## Project configuration

Place `.dsh-project-check.json` beside the target project's `package.json`. This plugin never creates it automatically. Example (requires an existing `test` script):

```json .dsh-project-check.json
{
  "version": 1,
  "tasks": [
    { "id": "unit", "name": "Unit tests", "script": "test", "args": [], "timeoutSeconds": 120 }
  ],
  "redactLiterals": []
}
```

Task `id`, `name`, `script`, and `args` are required. IDs must be nonblank and unique; script names must be own keys in `package.json.scripts` and must not start with `-` or contain NUL. Arguments are strings without NUL and are not shell-split. Omitted timeout defaults to 120 seconds; explicit values must be integers from 1 to 1800. Maximum 20 configured tasks. Empty task lists are valid configuration but do not constitute executed checks. Unknown fields (including `command`, `env`, `cwd`) are rejected. Optional `redactLiterals` must be an array of nonempty strings; task-output protection uses conservative whole-field hiding on any detected secret, incomplete stream, truncation or invalid encoding. Do not pass secrets in model/tool arguments.

Discovery returns `configStatus`, `configuredTaskCount`, `candidateCount`, fixed `configIssues` and `toolchainBlockers` in both JSON and its Markdown projection. `configuredTasks` distinguishes configured tasks from candidates, including ID/name/script, timeout, argument count and a redaction flag (not argument values). Candidate names are sorted, limited to 200 display entries, with exact `omittedCandidateCount`. This display bound does not change the task-selection limit. All project metadata is untrusted data, not executable instructions.

Dynamic metadata is checked against complete configured literals before any display transformation. Credential-shaped text, controls/bidi controls, invalid surrogate text, fields over 4 KiB, or fields exceeding the combined 64 KiB safe-text budget are hidden **whole**, never returned as a potentially sensitive prefix. `hiddenFieldCount` reports hiding separately from omitted candidates; the text budget does not include JSON structure or Markdown entity expansion. Known rules are conservative and may hide legitimate labels. If configuration is invalid, **all dynamic metadata** is withheld (`dynamicMetadataWithheld=true`), rather than ignoring invalid secret rules; no partial task list is exposed. Malformed JSON/read failures still use stable metadata errors.

Markdown is derived solely from the safe JSON object using numeric entity escaping; source/round-trip tests are not a real DSH UI rendering test. Metadata protection is separate from bounded task-log capture; neither can detect every unknown/encoded secret. The report includes the privacy and non-business-acceptance notices. A valid configuration and empty blockers are **not** execution authorization or a readiness certificate.

## Runtime tools (development implementation)

- `project_check_preview`: optional absolute `projectPath` (otherwise session cwd) and required `taskIds`. Freezes config-order tasks, argv/cwd/timeouts, metadata/toolchain/policy fingerprint and selection. Requires a real session identity; no npm probe or project script is executed during preview.
- `project_check_run`: accepts the complete returned `plan`, not an `approved` flag or custom command. Consumes it once, holds an instance-local project lock, and requests host approval. Only `allowed-once` starts selected scripts. Denial/unavailable approval produces `not_run`; changes before each task block remaining starts. Ordinary nonzero exits continue; unknown termination stops scheduling.
- `project_check_report`: accepts `runId`; returns only the calling session's cached safe report. Cache: five reports/ten minutes; previews: ten/ten minutes. Cancellation caches partial evidence at the known plan ID before propagating abort. Restart/unload clears memory.
- Run JSON/Markdown include task facts, plan, before/after Git, evidence gaps and `notices`. `SANDBOX_ENFORCEMENT_PARTIAL` / `SANDBOX_NOT_ENFORCED` are separate from script outcomes; a passing exit is not an isolation certificate. Notices also carry fixed recovery guidance for rejection, empty selection, busy, plan changes, timeouts and unknown outcomes. Tool-context errors include safe advice without provider diagnostics or argument values. No report file/export interface exists.

Deployment requires a trusted absolute `npmCliPath` to npm 11.16.0's `bin/npm-cli.js`. `nodeExecutable` may be explicit, but must resolve to the running mapped Node 24.18.0 binary. Metadata/CLI hashes and versions are rechecked; this is not cryptographic provenance for the complete npm distribution. Models/projects cannot override these deployment settings. `requireFullEnforcement: true` rejects partial/none before spawn; otherwise the current host policy is preserved, never escalated. Existing host `danger-full-access` is not confinement and must not be selected to bypass the blocked tests.

Git uses fixed sandboxed metadata commands, no diff/body reads, bounded NUL parsing and at most 200 safe paths. Process completion and both pipe EOFs are observed independently; premature close or invalid prefix encoding cannot be reported as a clean tree. Failure degrades to unavailable/incomplete evidence, not an invented clean tree. Logs retain at most 64 KiB raw output across two pipes, keep draining overflow, and hide unsafe fields rather than exposing secret-bearing prefixes. Project scripts and npm lifecycle hooks remain arbitrary code and may write files/access the network according to host capabilities.

## Local development

Requires Node 24.18.0 / npm 11.16.0 for the verified development combination. Direct DSH packages are fixed to 0.2.2-rc.3, Cordis to 4.1.0, TypeScript to 6.0.3; package-lock.json records the complete resolved graph. The npm release does not expose gitHead, so same version alone does not establish identity with the design's source SHA.

- `npm ci --ignore-scripts --no-audit --no-fund`: reproduce the inspected dependency installation without lifecycle scripts. This does **not** certify all optional CLI capabilities as usable.
- `npm test`: build with strict TypeScript, then run local filesystem, Cordis lifecycle, real confined Git/Node and protocol fault tests. Requires Git on PATH for synthetic repository setup. Git tests initialize/add/commit only inside their own temporary fixtures with hooks/signing disabled and isolated setup config; these are not plugin or user-project Git writes. Production Git reads under test still use the real read-only sandbox, never an unconfined retry. Temporary fixtures are cleaned up.
- `npm run build`: emit `dist/`.
- `npm pack --dry-run`: inspect the package file allowlist without publishing. Latest inspection includes 33 files, including the deployment patch example.
- `npm run test:package`: opt-in offline tarball installation/real Loader test in a self-cleaning temporary directory, with lifecycle scripts disabled and existing host peers shared. **Requires separate local-install authorization; latest authorized run passed (1/1), with no new packaging fixture directories remaining.** It is excluded from `npm test`, and is not a UI/approval or npm-lifecycle execution proof.

`cordis.patch.example.yml` is a deployment template, not an auto-activating bundle. Its path-substituted form passed the isolated packaged Loader/never-policy test; arbitrary user deployments and approved execution remain unverified. Replace all absolute-path placeholders in a separately approved host configuration. Its `requireFullEnforcement: true` deliberately refuses execution on the current partial-enforcement Windows provider; do not lower it to make blocked validation pass.

The initial install disabled lifecycle scripts. Native optional terminal-related dependencies were not rebuilt; do not infer PTY support from successful imports or CLI help. The subprocess-local postinstall only restores the executable bit of a POSIX helper; it was inspected, not run. The tested Windows pipe-mode confinement path worked without rebuilding. No system packages or global npm packages were installed.

## Verified evidence and limitations

See [stage implementation record](mai-specs/999-dsh-project-check/06-implementation/IMPLEMENTATION.md) and [latest lifecycle recheck](mai-specs/999-dsh-project-check/06-implementation/lifecycle_recheck.md) for actual commands and results. Preview cancellation/unload races and provider-disposal failure now have regression coverage: late snapshots cannot create plans, and cleanup errors do not skip clearing session data.

The [stage 7 review and fix recheck](mai-specs/999-dsh-project-check/07-code-review/fix_recheck.md) closes two source findings: task-controlled stderr matching a runner-failure signature is now conservatively `unknown` (not proof that no task ran), stopping later tasks; Git type-change status `T` is retained. The signature ambiguity has both protocol coverage and a real confined Windows direct-Node regression; it is not npm/UI approval evidence. Type-change coverage is parser-level, not a new OS symlink test.

The [authorized packaged-install recheck](mai-specs/999-dsh-project-check/07-code-review/package_recheck.md) passed strict build plus **1 packaging test / 1 passed / 0 failed / 0 skipped**. It installed the local 33-file tarball offline with lifecycle scripts disabled, loaded the installed dist through the real patch/Loader, verified discovery/preview/never-policy rejection/report retrieval, and removed all four tools on Loader unload. Temporary peers reuse existing host dependencies; this is not a from-scratch DSH installation or a UI/model-loop test. Fixture cleanup left zero new packaging directories. That packaging continuation did not rerun the main suite; the subsequent stage 8 check below did.

The Windows read-only provider probes report **partial** enforcement. Fixed synthetic Node probes verify version, direct argv preservation (Unicode/spaces/metacharacters), separate pipes/nonzero exit, and cancellation after root-process readiness. These do not establish npm's internal shell/argument behavior, project execution, approval, or all descendant termination cases. Tests do not override provider internals, mock successful confinement, or retry unconfined.

Latest stage 8 automated recheck: **148 tests / 147 passed / 0 failed / 1 blocked (skipped)**, with strict build passing. See the [actual acceptance record](mai-specs/999-dsh-project-check/08-acceptance/ACCEPTANCE.md) and its environment/test evidence. Overall acceptance remains **blocked, not passed**: none of the ten complete business journeys is signed off; four have passing subchecks awaiting further evidence and six are blocked. No installation or model call was performed in this recheck. The descendant-readiness probe encountered synchronous `spawn EPERM` inside the confined Node process. Only that exact fixed probe failure is classified as blocked; other failures remain failures. It is **not** a passing descendant-cancellation test. G-02 and T-01 remain open; do not relax sandbox permissions or enable execution to work around this result. The design's coding-first dependency supplement allows implementation and protocol tests to proceed; it does not close those gates.

Registry tests load the compiled package in real Cordis contexts and verify lifecycle removal. A runtime integration test uses real session/approval services with `never` policy to verify frozen preview, rejection, same-session retrieval and no project-file additions. Its agent facade is synthetic: this is **not** a model-loop/UI approval test. State-machine and policy-race tests use explicit protocol fakes; those are not OS confinement evidence.

Real Git repository integration now verifies clean/staged/unstaged/untracked states, Unicode/spaces, subtree filtering, internal and crossing renames, top-200 omissions, literal hiding and unchanged index bytes. On this Windows development combination (Git 2.55.0.windows.2), all five integration cases pass through the existing read-only/partial sandbox. Separate protocol tests reproduce delayed pipe tails and premature close; neither is hidden as an environment skip.

## Remaining integration / release blockers

- Real DSH UI approve/reject/cancel loop and renderer verification, including long-running calls and cancellation report retrieval.
- Windows npm argv/lifecycle and managed descendant termination; current EPERM is unresolved.
- Version/source artifact correspondence; isolated local tarball install/patch/unload verification has passed, but does not establish registry artifact provenance.
- Remaining real-host portions of the PRD/test plan: source contracts and local development coverage do not close business ACs or certify release readiness.

Four tools have implementations, not unconditional-refusal placeholders; no export tool exists. Do not claim AC-01/04/10/12 completed based on development tests alone. No real model calls, credential access, permission-mode escalation, workspace-write ACL changes, or interactive server startup were performed; packaging verification used embedded app-boot/Loader services. An interactive host environment and user participation in real approvals remain to be arranged before the first slice can be closed.
