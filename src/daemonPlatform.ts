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

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(scriptPath)}</string>
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
ExecStart="${nodePath}" "${scriptPath}" --daemon-worker
Restart=always
StandardOutput=append:${LOG_PATH}
StandardError=append:${LOG_PATH}

[Install]
WantedBy=default.target`;
}

export async function registerPlatform(): Promise<void> {
  if (isPlatformRunning()) {
    throw new CLIError("Service already registered. Run --daemon stop first.");
  }
  const nodePath = process.execPath;
  const scriptPath = process.argv[1];
  await mkdirp(path.dirname(LOG_PATH));
  if (process.platform === "darwin") {
    await mkdirp(path.dirname(LAUNCHD_PLIST_PATH));
    fs.writeFileSync(
      LAUNCHD_PLIST_PATH,
      generateLaunchdPlist(nodePath, scriptPath),
      "utf8"
    );
    const uid = os.userInfo().uid;
    try {
      execFileSync("launchctl", ["bootstrap", `gui/${uid}`, LAUNCHD_PLIST_PATH], {
        stdio: "pipe",
      });
    } catch (err) {
      throw new CLIError(
        `launchctl bootstrap failed: ${(err as Error).message}`
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

// eslint-disable-next-line @typescript-eslint/require-await
export async function unregisterPlatform(): Promise<void> {
  if (process.platform === "darwin") {
    const uid = os.userInfo().uid;
    try {
      execFileSync("launchctl", ["bootout", `gui/${uid}/${LAUNCHD_LABEL}`], {
        stdio: "pipe",
      });
    } catch (err) {
      const msg = (err as { stderr?: Buffer }).stderr?.toString() ?? "";
      if (!msg.includes("Could not find") && !msg.includes("No such process")) {
        throw new CLIError(`launchctl bootout failed: ${(err as Error).message}`);
      }
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
    } catch (err) {
      const msg =
        (err as { stderr?: Buffer }).stderr?.toString() ??
        (err as Error).message ??
        "";
      if (!msg.includes("not loaded") && !msg.includes("No such file")) {
        throw new CLIError(`systemctl disable failed: ${(err as Error).message}`);
      }
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
  throw new CLIError(
    `Unsupported platform: ${process.platform}. Supported: darwin, linux.`
  );
}
