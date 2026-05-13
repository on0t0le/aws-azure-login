# Autopilot Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `--daemon`/`--daemon-worker` CLI flags with `--autopilot`/`--no-autopilot`/`--autopilot-worker`, add per-profile `azure_default_autopilot` opt-in, gate the watch loop on that setting, and document the feature as experimental in README.

**Architecture:** Six source files touched in isolation — interface first, then each consumer, then docs. No new files. No test framework exists; TypeScript compilation (`npm run build`) is the primary correctness gate; `npm run test` runs eslint + prettier.

**Tech Stack:** TypeScript, commander v9, inquirer v8, ini, Node.js

---

### Task 1: Add `azure_default_autopilot` to `ProfileConfig`

**Files:**
- Modify: `src/awsConfig.ts`

- [ ] **Step 1: Add field to interface**

In `src/awsConfig.ts`, find the `ProfileConfig` interface:

```typescript
export interface ProfileConfig {
  azure_tenant_id: string;
  azure_app_id_uri: string;
  azure_default_username: string;
  azure_default_password?: string;
  azure_default_role_arn: string;
  azure_default_duration_hours: string;
  region: string;
  azure_default_remember_me: boolean;
  [key: string]: unknown;
}
```

Replace with:

```typescript
export interface ProfileConfig {
  azure_tenant_id: string;
  azure_app_id_uri: string;
  azure_default_username: string;
  azure_default_password?: string;
  azure_default_role_arn: string;
  azure_default_duration_hours: string;
  region: string;
  azure_default_remember_me: boolean;
  azure_default_autopilot?: boolean;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/awsConfig.ts lib/awsConfig.js
git commit -m "feat: add azure_default_autopilot field to ProfileConfig"
```

---

### Task 2: Add autopilot question to `--configure` flow

**Files:**
- Modify: `src/configureProfileAsync.ts`

- [ ] **Step 1: Add the autopilot question after rememberMe**

In `src/configureProfileAsync.ts`, find the `questions` array. After the `rememberMe` question object (which ends with `}`), add:

```typescript
    {
      name: "autopilot",
      message:
        "Autopilot: automatically refresh credentials in the background (true|false)",
      default:
        (profile &&
          profile.azure_default_autopilot !== undefined &&
          profile.azure_default_autopilot.toString()) ||
        "false",
      validate: (input): boolean | string => {
        if (input === "true" || input === "false") return true;
        return "Autopilot must be either true or false";
      },
    },
```

- [ ] **Step 2: Save autopilot in `setProfileConfigValuesAsync` call**

Find the `await awsConfig.setProfileConfigValuesAsync(profileName, { ... })` call at the bottom of the function. Replace the entire call with:

```typescript
  await awsConfig.setProfileConfigValuesAsync(profileName, {
    azure_tenant_id: answers.tenantId as string,
    azure_app_id_uri: answers.appIdUri as string,
    azure_default_username: answers.username as string,
    azure_default_role_arn: answers.defaultRoleArn as string,
    azure_default_duration_hours: answers.defaultDurationHours as string,
    azure_default_remember_me: (answers.rememberMe as string) === "true",
    azure_default_autopilot: (answers.autopilot as string) === "true",
    region: answers.region as string,
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/configureProfileAsync.ts lib/configureProfileAsync.js
git commit -m "feat: add autopilot question to --configure flow"
```

---

### Task 3: Rename `--daemon-worker` to `--autopilot-worker` in OS service templates

**Files:**
- Modify: `src/daemonPlatform.ts`

- [ ] **Step 1: Update launchd plist template**

In `src/daemonPlatform.ts`, inside `generateLaunchdPlist`, find:

```xml
    <string>--daemon-worker</string>
```

Replace with:

```xml
    <string>--autopilot-worker</string>
```

- [ ] **Step 2: Update systemd unit template**

In `src/daemonPlatform.ts`, inside `generateSystemdUnit`, find:

```
  )}" --daemon-worker
```

Replace with:

```
  )}" --autopilot-worker
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/daemonPlatform.ts lib/daemonPlatform.js
git commit -m "feat: rename --daemon-worker to --autopilot-worker in OS service templates"
```

---

### Task 4: Update `watchLoop` to gate on `azure_default_autopilot`

**Files:**
- Modify: `src/daemon.ts`

- [ ] **Step 1: Replace the entire `watchLoop` function**

In `src/daemon.ts`, replace the entire `export async function watchLoop(): Promise<void>` function with:

```typescript
export async function watchLoop(): Promise<void> {
  console.log("aws-azure-login autopilot started. Polling every 60s.");

  const poll = async (): Promise<void> => {
    debug("Polling profiles...");
    const profiles = await awsConfig.getAllProfileNames();
    if (!profiles) return;

    for (const profile of profiles) {
      try {
        const config = await awsConfig.getProfileConfigAsync(profile);
        if (!config || !config.azure_tenant_id) continue;

        if (String(config.azure_default_autopilot) !== "true") continue;

        if (
          String(config.azure_default_remember_me) !== "true" ||
          !config.azure_default_password
        ) {
          console.warn(
            `[${new Date().toISOString()}] Skipping ${profile}: autopilot=true but azure_default_remember_me and azure_default_password must both be set.`
          );
          continue;
        }

        const aboutToExpire = await awsConfig.isProfileAboutToExpireAsync(
          profile
        );
        if (!aboutToExpire) continue;

        console.log(
          `[${new Date().toISOString()}] Refreshing profile: ${profile}`
        );
        await login.loginAsync(
          profile,
          "cli",
          true, // disableSandbox
          true, // noPrompt
          false, // enableChromeNetworkService
          false, // awsNoVerifySsl
          false, // enableChromeSeamlessSso
          false, // noDisableExtensions
          false // disableGpu
        );
        console.log(
          `[${new Date().toISOString()}] Refreshed profile: ${profile}`
        );
      } catch (err) {
        console.error(
          `[${new Date().toISOString()}] Error refreshing profile ${profile}:`,
          err
        );
      }
    }
  };

  await poll();
  setInterval(() => {
    poll().catch((err: unknown) =>
      console.error(`[${new Date().toISOString()}] Poll error:`, err)
    );
  }, POLL_INTERVAL_MS);
}
```

- [ ] **Step 2: Remove unused `sendNotification` function**

Delete the entire `function sendNotification(profile: string): void { ... }` block from the bottom of `src/daemon.ts`.

- [ ] **Step 3: Remove unused `execFileSync` import**

In `src/daemon.ts`, remove the line:

```typescript
import { execFileSync } from "child_process";
```

- [ ] **Step 4: Verify TypeScript compiles with no unused-import warnings**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/daemon.ts lib/daemon.js
git commit -m "feat: gate autopilot watch loop on azure_default_autopilot profile setting"
```

---

### Task 5: Replace daemon flags with autopilot flags in CLI entry point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Remove daemon options, add autopilot options**

In `src/index.ts`, find and remove these two `.option(...)` calls:

```typescript
  .option(
    "--daemon <action>",
    "Manage the auto-refresh daemon: start | stop | status"
  )
  .option(
    "--daemon-worker",
    "Internal: run the daemon watch loop (do not call directly)"
  )
```

Replace them with:

```typescript
  .option("--autopilot", "Start the autopilot background service [EXPERIMENTAL]")
  .option("--no-autopilot", "Stop the autopilot background service")
  .option(
    "--autopilot-worker",
    "Internal: run the autopilot watch loop (do not call directly)"
  )
```

- [ ] **Step 2: Replace handler logic**

In `src/index.ts`, find and replace the daemon handler block:

```typescript
    if (options.daemonWorker as boolean | undefined) {
      const { watchLoop } = await import("./daemon");
      return watchLoop();
    }

    if (options.daemon as string | undefined) {
      const { startDaemon, stopDaemon, statusDaemon } = await import(
        "./daemon"
      );
      const action = options.daemon as string;
      if (action === "start") return startDaemon();
      if (action === "stop") return stopDaemon();
      if (action === "status") {
        statusDaemon();
        return;
      }
      throw new CLIError(
        `Unknown daemon action: '${action}'. Use start, stop, or status.`
      );
    }
```

Replace with:

```typescript
    if (options.autopilotWorker as boolean | undefined) {
      const { watchLoop } = await import("./daemon");
      return watchLoop();
    }

    // Use process.argv directly to distinguish --autopilot from --no-autopilot
    // (both affect options.autopilot; rawArgs gives us the explicit flag passed)
    const enableAutopilot = process.argv.includes("--autopilot");
    const disableAutopilot = process.argv.includes("--no-autopilot");

    if (enableAutopilot) {
      const { startDaemon, isPlatformRunning } = await import("./daemon");
      if (isPlatformRunning()) {
        console.log("Autopilot already enabled.");
        return;
      }
      await startDaemon();
      console.log("Autopilot enabled.");
      return;
    }

    if (disableAutopilot) {
      const { stopDaemon, isPlatformRunning } = await import("./daemon");
      if (!isPlatformRunning()) {
        console.log("Autopilot not running.");
        return;
      }
      await stopDaemon();
      console.log("Autopilot disabled.");
      return;
    }
```

- [ ] **Step 3: Export `isPlatformRunning` from `daemon.ts` (it's in `daemonPlatform.ts`)**

Open `src/daemon.ts`. Add `isPlatformRunning` to the re-export from `daemonPlatform`:

```typescript
import {
  registerPlatform,
  unregisterPlatform,
  getPlatformStatus,
  isPlatformRunning,
} from "./daemonPlatform";
```

Then export it from `daemon.ts` so `index.ts` can import it:

```typescript
export { isPlatformRunning } from "./daemonPlatform";
```

Add this line at the bottom of `src/daemon.ts` (after the last function).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Smoke-test help output**

```bash
node lib/index.js --help
```

Expected: `--autopilot`, `--no-autopilot`, `--autopilot-worker` appear. `--daemon` and `--daemon-worker` do not appear.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/daemon.ts lib/index.js lib/daemon.js
git commit -m "feat: replace --daemon flags with --autopilot/--no-autopilot"
```

---

### Task 6: Add Experimental Features section to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the section**

In `README.md`, find the line:

```markdown
## Getting Your Tenant ID and App ID URI
```

Insert the following block immediately before it (with a blank line before `## Getting`):

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

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Experimental Features / Autopilot section to README"
```

---

### Task 7: Final lint + build verify

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: eslint and prettier checks pass with no errors.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: TypeScript compilation succeeds with no errors.

- [ ] **Step 3: Verify no removed flag references remain in source**

```bash
grep -rn "\-\-daemon" src/ --include="*.ts"
```

Expected: no output (all `--daemon` and `--daemon-worker` flag strings removed).
