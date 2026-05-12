# Auto-Rotate Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-platform background daemon that auto-refreshes AWS credentials before expiry, registering itself as a launchd (macOS) or systemd (Linux) service.

**Architecture:** Two new files — `src/daemonPlatform.ts` handles OS service file generation and registration/unregistration, `src/daemon.ts` contains the watch loop and start/stop/status commands. `src/index.ts` is extended with `--daemon <action>` and `--daemon-worker` flags.

**Tech Stack:** Node.js `child_process.execFileSync` (no shell, prevents injection), `fs`, `mkdirp` (already a dep), `commander` (already a dep), TypeScript 5.4, launchd (macOS), systemd user units (Linux).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/daemonPlatform.ts` | Create | OS service file generation, launchctl/systemctl wrappers |
| `src/daemon.ts` | Create | startDaemon, stopDaemon, statusDaemon, watchLoop |
| `src/index.ts` | Modify | Add `--daemon <action>` and `--daemon-worker` CLI flags |

---

### Task 1: Create `src/daemonPlatform.ts`

**Files:**
- Create: `src/daemonPlatform.ts`

All OS commands use `execFileSync` with argument arrays — no shell interpolation, no injection risk.

- [ ] **Step 1: Write `src/daemonPlatform.ts`**

```typescript
import os from "os";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import mkdirp from "mkdirp";
import { CLIError } from "./CLIError";

const LAUNCHD_LABEL = "com.aws-azure-login";
const LAUNCHD_PLIST_PATH = path.join(
  os.homedir(),
  "Library",
  "LaunchAgents",
  `${LAUNCHD_LABEL}.plist`
);
const SYSTEMD_SERVICE_NAME = "aws-azure-login";
const SYSTEMD_UNIT_PATH = path.join(
  os.homedir(),
  ".config",
  "systemd",
  "user",
  `${SYSTEMD_SERVICE_NAME}.service`
);
const LOG_PATH = path.join(
  os.homedir(),
  ".aws",
  "aws-azure-login-daemon.log"
);

export function generateLaunchdPlist(
  nodePath: string,
  scriptPath: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${scriptPath}</string>
    <string>--daemon-worker</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
</dict>
</plist>`;
}

export function generateSystemdUnit(
  nodePath: string,
  scriptPath: string
): string {
  return `[Unit]
Description=aws-azure-login credential auto-refresh daemon

[Service]
ExecStart=${nodePath} ${scriptPath} --daemon-worker
Restart=always
StandardOutput=append:${LOG_PATH}
StandardError=append:${LOG_PATH}

[Install]
WantedBy=default.target`;
}

export async function registerPlatform(): Promise<void> {
  const nodePath = process.execPath;
  const scriptPath = process.argv[1];
  if (process.platform === "darwin") {
    await mkdirp(path.dirname(LAUNCHD_PLIST_PATH));
    fs.writeFileSync(
      LAUNCHD_PLIST_PATH,
      generateLaunchdPlist(nodePath, scriptPath),
      "utf8"
    );
    try {
      execFileSync("launchctl", ["load", LAUNCHD_PLIST_PATH], {
        stdio: "pipe",
      });
    } catch (err) {
      throw new CLIError(
        `launchctl load failed: ${(err as Error).message}`
      );
    }
  } else if (process.platform === "linux") {
    await mkdirp(path.dirname(SYSTEMD_UNIT_PATH));
    fs.writeFileSync(
      SYSTEMD_UNIT_PATH,
      generateSystemdUnit(nodePath, scriptPath),
      "utf8"
    );
    try {
      execFileSync(
        "systemctl",
        ["--user", "enable", "--now", SYSTEMD_SERVICE_NAME],
        { stdio: "pipe" }
      );
    } catch (err) {
      throw new CLIError(
        `systemctl enable failed: ${(err as Error).message}`
      );
    }
  } else {
    throw new CLIError(
      `Unsupported platform: ${process.platform}. Supported: darwin, linux.`
    );
  }
}

export async function unregisterPlatform(): Promise<void> {
  if (process.platform === "darwin") {
    try {
      execFileSync("launchctl", ["unload", LAUNCHD_PLIST_PATH], {
        stdio: "pipe",
      });
    } catch {
      // already unloaded
    }
    if (fs.existsSync(LAUNCHD_PLIST_PATH)) {
      fs.unlinkSync(LAUNCHD_PLIST_PATH);
    }
  } else if (process.platform === "linux") {
    try {
      execFileSync(
        "systemctl",
        ["--user", "disable", "--now", SYSTEMD_SERVICE_NAME],
        { stdio: "pipe" }
      );
    } catch {
      // already stopped
    }
    if (fs.existsSync(SYSTEMD_UNIT_PATH)) {
      fs.unlinkSync(SYSTEMD_UNIT_PATH);
    }
  } else {
    throw new CLIError(
      `Unsupported platform: ${process.platform}. Supported: darwin, linux.`
    );
  }
}

export function getPlatformStatus(): string {
  if (process.platform === "darwin") {
    try {
      return execFileSync("launchctl", ["list", LAUNCHD_LABEL], {
        stdio: "pipe",
      }).toString();
    } catch {
      return "Not running";
    }
  } else if (process.platform === "linux") {
    try {
      return execFileSync(
        "systemctl",
        ["--user", "status", SYSTEMD_SERVICE_NAME],
        { stdio: "pipe" }
      ).toString();
    } catch (err) {
      return (
        (err as { stdout?: Buffer }).stdout?.toString() ?? "Not running"
      );
    }
  } else {
    throw new CLIError(
      `Unsupported platform: ${process.platform}. Supported: darwin, linux.`
    );
  }
}

export function isPlatformRunning(): boolean {
  if (process.platform === "darwin") {
    try {
      execFileSync("launchctl", ["list", LAUNCHD_LABEL], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  } else if (process.platform === "linux") {
    try {
      const out = execFileSync(
        "systemctl",
        ["--user", "is-active", SYSTEMD_SERVICE_NAME],
        { stdio: "pipe" }
      )
        .toString()
        .trim();
      return out === "active";
    } catch {
      return false;
    }
  }
  return false;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
npm run eslint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/daemonPlatform.ts
git commit -m "feat: add daemonPlatform — launchd/systemd service file management"
```

---

### Task 2: Create `src/daemon.ts`

**Files:**
- Create: `src/daemon.ts`

- [ ] **Step 1: Write `src/daemon.ts`**

```typescript
import { execFileSync } from "child_process";
import _debug from "debug";
import { awsConfig } from "./awsConfig";
import { login } from "./login";
import {
  registerPlatform,
  unregisterPlatform,
  getPlatformStatus,
  isPlatformRunning,
} from "./daemonPlatform";

const debug = _debug("aws-azure-login");
const POLL_INTERVAL_MS = 60 * 1000;

export async function startDaemon(): Promise<void> {
  if (isPlatformRunning()) {
    console.log("Daemon already running.");
    return;
  }
  await registerPlatform();
  console.log("Daemon started and registered as OS service.");
}

export async function stopDaemon(): Promise<void> {
  if (!isPlatformRunning()) {
    console.log("Daemon not running.");
    return;
  }
  await unregisterPlatform();
  console.log("Daemon stopped and unregistered.");
}

export function statusDaemon(): void {
  console.log(getPlatformStatus());
}

export async function watchLoop(): Promise<void> {
  console.log("aws-azure-login daemon started. Polling every 60s.");

  const poll = async (): Promise<void> => {
    debug("Polling profiles...");
    const profiles = await awsConfig.getAllProfileNames();
    if (!profiles) return;

    for (const profile of profiles) {
      try {
        const aboutToExpire =
          await awsConfig.isProfileAboutToExpireAsync(profile);
        if (!aboutToExpire) continue;

        const config = await awsConfig.getProfileConfigAsync(profile);
        if (!config) continue;

        if (config.azure_default_remember_me) {
          console.log(
            `[${new Date().toISOString()}] Refreshing profile: ${profile}`
          );
          await login.loginAsync(
            profile,
            "cli",
            true,  // disableSandbox
            true,  // noPrompt
            false, // enableChromeNetworkService
            false, // awsNoVerifySsl
            false, // enableChromeSeamlessSso
            false, // noDisableExtensions
            false  // disableGpu
          );
          console.log(
            `[${new Date().toISOString()}] Refreshed profile: ${profile}`
          );
        } else {
          console.log(
            `[${new Date().toISOString()}] Profile ${profile} expiring — remember_me not set, sending notification`
          );
          sendNotification(profile);
        }
      } catch (err) {
        console.error(
          `[${new Date().toISOString()}] Error refreshing profile ${profile}:`,
          err
        );
        sendNotification(profile);
      }
    }
  };

  await poll();
  setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);
}

function sendNotification(profile: string): void {
  const title = "aws-azure-login";
  const body = `Profile ${profile} expires soon. Run: aws-azure-login -p ${profile}`;
  try {
    if (process.platform === "darwin") {
      // Pass message as a separate arg to avoid shell injection
      const script = `display notification "${body.replace(/"/g, '\\"')}" with title "${title}"`;
      execFileSync("osascript", ["-e", script], { stdio: "pipe" });
    } else if (process.platform === "linux") {
      execFileSync("notify-send", [title, body], { stdio: "pipe" });
    }
  } catch {
    // notifications are non-critical
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
npm run eslint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/daemon.ts
git commit -m "feat: add daemon — watchLoop, startDaemon, stopDaemon, statusDaemon"
```

---

### Task 3: Extend `src/index.ts` with `--daemon` and `--daemon-worker` flags

**Files:**
- Modify: `src/index.ts`

The file currently imports from `configureProfileAsync` and `login`. We need to add `CLIError` import and two new option declarations plus two dispatch branches.

- [ ] **Step 1: Add `CLIError` import**

At the top of `src/index.ts`, after `import { login } from "./login";`, add:

```typescript
import { CLIError } from "./CLIError";
```

- [ ] **Step 2: Add `--daemon` and `--daemon-worker` options**

After the `.option("--disable-gpu", ...)` block (before `.parse(process.argv)`), add:

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

- [ ] **Step 3: Replace the dispatch block**

Replace the existing `Promise.resolve().then(...).catch(...)` block with:

```typescript
Promise.resolve()
  .then(async () => {
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

    if (options.allProfiles as boolean | undefined) {
      return login.loginAll(
        mode,
        disableSandbox,
        noPrompt,
        enableChromeNetworkService,
        awsNoVerifySsl,
        enableChromeSeamlessSso,
        forceRefresh,
        noDisableExtensions,
        disableGpu
      );
    }

    if (options.configure as boolean | undefined)
      return configureProfileAsync(profileName);

    return login.loginAsync(
      profileName,
      mode,
      disableSandbox,
      noPrompt,
      enableChromeNetworkService,
      awsNoVerifySsl,
      enableChromeSeamlessSso,
      noDisableExtensions,
      disableGpu
    );
  })
  .catch((err: Error) => {
    if (err.name === "CLIError") {
      console.error(err.message);
      process.exit(2);
    } else {
      console.log(err);
    }
  });
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Lint**

```bash
npm run eslint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: add --daemon start|stop|status and --daemon-worker CLI flags"
```

---

### Task 4: Build and smoke test

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: `lib/` directory populated, no TypeScript errors.

- [ ] **Step 2: Verify `--daemon status` without a running daemon**

```bash
node lib/index.js --daemon status
```

Expected: prints `"Not running"` on macOS, or systemd status text on Linux. No crash.

- [ ] **Step 3: Verify `--daemon stop` when not running**

```bash
node lib/index.js --daemon stop
```

Expected: prints `"Daemon not running."`, exits 0.

- [ ] **Step 4: Verify `--daemon start` registers the service**

```bash
node lib/index.js --daemon start
```

Expected: prints `"Daemon started and registered as OS service."`

Verify on macOS:
```bash
launchctl list com.aws-azure-login
```
Expected: entry present with a PID.

Verify on Linux:
```bash
systemctl --user status aws-azure-login
```
Expected: `active (running)`.

- [ ] **Step 5: Verify daemon log**

```bash
tail -f ~/.aws/aws-azure-login-daemon.log
```

Expected: `"aws-azure-login daemon started. Polling every 60s."` followed by per-profile poll lines.

- [ ] **Step 6: Verify `--daemon stop`**

```bash
node lib/index.js --daemon stop
```

Expected: `"Daemon stopped and unregistered."`. Service no longer listed in launchctl/systemctl.

- [ ] **Step 7: Final commit**

```bash
git add -p
git commit -m "feat: auto-rotate credentials daemon — complete"
```

---

### Task 5: Update CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Append manual test section to `CONTRIBUTING.md`**

```markdown
## Testing the Auto-Refresh Daemon

No automated tests exist for the daemon. Manual smoke test:

1. Build: `npm run build`
2. Start daemon: `node lib/index.js --daemon start`
3. Verify OS service registered:
   - macOS: `launchctl list com.aws-azure-login`
   - Linux: `systemctl --user status aws-azure-login`
4. Tail daemon log: `tail -f ~/.aws/aws-azure-login-daemon.log`
5. Check status: `node lib/index.js --daemon status`
6. Stop daemon: `node lib/index.js --daemon stop`

To test auto-rotation, set `aws_expiration` in `~/.aws/credentials` to ~12 minutes
from now for a profile. Profiles with `azure_default_remember_me = true` will attempt
a silent re-login. Profiles without it will receive an OS notification.
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add daemon manual test instructions to CONTRIBUTING.md"
```
