# Auto-Rotate Credentials Design

**Date:** 2026-05-12
**Status:** Approved

## Overview

Add a background daemon that monitors all configured AWS profiles and automatically refreshes credentials before they expire (within the existing 11-minute threshold). For profiles with `azure_default_remember_me: true`, rotation is silent. For others, an OS notification prompts the user to login manually.

## CLI Interface

```
aws-azure-login --daemon start    # register + start OS service
aws-azure-login --daemon stop     # stop + unregister OS service
aws-azure-login --daemon status   # show running state
```

`--daemon-worker` is an internal flag used by the OS service definition. Not user-facing.

## Architecture

### New Files

**`src/daemon.ts`**
- `startDaemon()` — resolve binary path, write platform service file, register with OS
- `stopDaemon()` — unregister from OS, remove service file
- `statusDaemon()` — query OS service state, print human-readable output
- `watchLoop()` — core polling loop; called when process runs with `--daemon-worker`

**`src/daemonPlatform.ts`**
- `registerLaunchd(binaryPath)` — write plist to `~/Library/LaunchAgents/com.aws-azure-login.plist`, call `launchctl load`
- `unregisterLaunchd()` — `launchctl unload`, remove plist
- `registerSystemd(binaryPath)` — write unit to `~/.config/systemd/user/aws-azure-login.service`, call `systemctl --user enable --now`
- `unregisterSystemd()` — `systemctl --user disable --now`, remove unit
- `getStatusLaunchd()` / `getStatusSystemd()` — query OS, return status string
- Platform detected via `process.platform`

### Modified Files

**`src/index.ts`** — parse `--daemon <start|stop|status>` and `--daemon-worker`, dispatch to `daemon.ts`

**`src/awsConfig.ts`** — no changes needed; `isProfileAboutToExpireAsync` and `refreshLimitInMs = 11 * 60 * 1000` already cover the 10-minute window

## Watch Loop

Runs on a 60-second `setInterval`:

1. `awsConfig.getAllProfileNames()` — get all profiles
2. For each profile, `awsConfig.isProfileAboutToExpireAsync(profile)`
3. If about to expire:
   - `azure_default_remember_me: true` → `login.loginAsync(profile, mode='cli', noPrompt=true, ...)`
   - `azure_default_remember_me: false` → send OS notification, skip

### Notifications

- **macOS:** `osascript -e 'display notification "Profile <X> expires soon. Run: aws-azure-login -p <X>" with title "aws-azure-login"'`
- **Linux:** `notify-send "aws-azure-login" "Profile <X> expires soon. Run: aws-azure-login -p <X>"`
- Notification failure is swallowed (non-critical)

## Platform Service Files

### macOS — `~/Library/LaunchAgents/com.aws-azure-login.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aws-azure-login</string>
  <key>ProgramArguments</key>
  <array>
    <string>{binaryPath}</string>
    <string>--daemon-worker</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>{homeDir}/.aws/aws-azure-login-daemon.log</string>
  <key>StandardErrorPath</key>
  <string>{homeDir}/.aws/aws-azure-login-daemon.log</string>
</dict>
</plist>
```

### Linux — `~/.config/systemd/user/aws-azure-login.service`

```ini
[Unit]
Description=aws-azure-login credential auto-refresh daemon

[Service]
ExecStart={binaryPath} --daemon-worker
Restart=always
StandardOutput=append:{homeDir}/.aws/aws-azure-login-daemon.log
StandardError=append:{homeDir}/.aws/aws-azure-login-daemon.log

[Install]
WantedBy=default.target
```

Binary path resolved at runtime via `process.execPath`.

## Error Handling

| Scenario | Behavior |
|---|---|
| Login fails during auto-rotation | Log to `~/.aws/aws-azure-login-daemon.log`, send OS notification, continue |
| Profile has no `aws_expiration` | Treat as expired, attempt login |
| `launchctl`/`systemctl` not found | `CLIError` with clear message |
| `--daemon start` already running | Print "Daemon already running", exit 0 |
| `--daemon stop` not running | Print "Daemon not running", exit 0 |
| Notification command fails | Swallow silently |
| Azure session expired (headless) | Login throws, caught by login error handler, notification sent |

## Logging

All daemon stdout/stderr redirected to `~/.aws/aws-azure-login-daemon.log` by the OS service manager. The watch loop logs profile name and action at each poll cycle.

## Testing

No test framework exists in the project. Validation:

- `npm run eslint` passes
- `tsc --noEmit` passes (type-check)
- Manual smoke test: `aws-azure-login --daemon start`, verify service registered, verify credential rotation fires near expiry
- Manual test documented in `CONTRIBUTING.md`
