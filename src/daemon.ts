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
        const aboutToExpire = await awsConfig.isProfileAboutToExpireAsync(
          profile
        );
        if (!aboutToExpire) continue;

        const config = await awsConfig.getProfileConfigAsync(profile);
        if (!config) continue;

        if (String(config.azure_default_remember_me) === "true") {
          if (!config.azure_default_password) {
            console.warn(
              `[${new Date().toISOString()}] Skipping ${profile}: remember_me=true but no azure_default_password set`
            );
            sendNotification(profile);
            continue;
          }
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
    poll().catch((err: unknown) =>
      console.error(`[${new Date().toISOString()}] Poll error:`, err)
    );
  }, POLL_INTERVAL_MS);
}

function sendNotification(profile: string): void {
  const title = "aws-azure-login";
  const body = `Profile ${profile} expires soon. Run: aws-azure-login -p ${profile}`;
  try {
    if (process.platform === "darwin") {
      const escaped = body.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script = `display notification "${escaped}" with title "${title}"`;
      execFileSync("osascript", ["-e", script], { stdio: "pipe" });
    } else if (process.platform === "linux") {
      execFileSync("notify-send", [title, body], { stdio: "pipe" });
    }
  } catch {
    // notifications are non-critical
  }
}
