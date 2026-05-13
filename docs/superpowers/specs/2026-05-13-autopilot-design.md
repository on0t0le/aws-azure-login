# Autopilot Feature — Design Spec

Date: 2026-05-13

## Summary

Refactor `--daemon` to `--autopilot`/`--no-autopilot`. Mark the feature experimental in README. Add per-profile `azure_default_autopilot` opt-in setting. Ask for it during `--configure`.

## Scope

Files affected:
- `src/index.ts` — CLI flag changes
- `src/daemon.ts` — watchLoop filter + internal flag rename
- `src/daemonPlatform.ts` — `--daemon-worker` → `--autopilot-worker` in service file templates
- `src/awsConfig.ts` — add `azure_default_autopilot` to `ProfileConfig`
- `src/configureProfileAsync.ts` — add autopilot question
- `README.md` — add Experimental Features section

## 1. CLI Flags

### Removed
- `--daemon <start|stop|status>`
- `--daemon-worker`

### Added
- `--autopilot` (boolean) — starts the background OS service
- `--no-autopilot` (boolean) — stops the background OS service
- `--autopilot-worker` (boolean, internal) — runs the watch loop; never document publicly

### Behavior
| Invocation | Condition | Output |
|---|---|---|
| `--autopilot` | not running | starts service, prints "Autopilot enabled." |
| `--autopilot` | already running | prints "Autopilot already enabled." and exits |
| `--no-autopilot` | running | stops service, prints "Autopilot disabled." |
| `--no-autopilot` | not running | prints "Autopilot not running." and exits |

## 2. Profile Config

### `ProfileConfig` interface (`src/awsConfig.ts`)

Add optional field:
```ts
azure_default_autopilot?: boolean;
```

Default when absent: `false`.

### Configure prompt (`src/configureProfileAsync.ts`)

Insert after the `rememberMe` question:

```
Autopilot: automatically refresh credentials in the background (true|false) [false]
```

Validates: must be `"true"` or `"false"`.
Saved as: `azure_default_autopilot: boolean`.

## 3. Watch Loop (`src/daemon.ts`)

`watchLoop` profile processing logic:

1. Load all profile names.
2. For each profile:
   a. Load profile config.
   b. Skip (silently) if `azure_default_autopilot !== true`.
   c. If `azure_default_autopilot=true` but `azure_default_remember_me` is not `true` OR `azure_default_password` is absent:
      - Log: `[ISO timestamp] Skipping ${profile}: autopilot=true but azure_default_remember_me and azure_default_password must both be set.`
      - Continue.
   d. Check if credentials are about to expire; skip if not.
   e. Attempt login. On error: log error and continue.

## 4. OS Service Files (`src/daemonPlatform.ts`)

- Replace `--daemon-worker` with `--autopilot-worker` in `generateLaunchdPlist` and `generateSystemdUnit`.
- Service identifiers unchanged: `com.aws-azure-login` (launchd), `aws-azure-login` (systemd) — changing these would orphan existing registered services.

## 5. README

Add new top-level section **Experimental Features** after the existing usage section:

```markdown
## Experimental Features

### Autopilot (background credential refresh)

> ⚠️ Experimental — behavior may change.

Autopilot runs a background OS service that automatically refreshes
credentials before they expire.

**Enable per profile** (during `--configure` or manually in `~/.aws/config`):

    azure_default_autopilot = true

Autopilot only refreshes profiles with `azure_default_autopilot=true`
and `azure_default_remember_me=true` + `azure_default_password` set.

**Commands:**

    aws-azure-login --autopilot       # start background service
    aws-azure-login --no-autopilot    # stop background service

Supported platforms: macOS (launchd), Linux (systemd).
```

## Out of Scope

- `--all-profiles` does not respect `azure_default_autopilot`.
- No status command (users check OS service directly if needed).
- No backwards-compat `--daemon` alias.
