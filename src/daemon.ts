import _debug from "debug";
import { awsConfig } from "./awsConfig";
import { login } from "./login";
import {
  registerPlatform,
  unregisterPlatform,
  isPlatformRunning,
} from "./daemonPlatform";

const debug = _debug("aws-azure-login");
const POLL_INTERVAL_MS = 60 * 1000;

export async function startDaemon(): Promise<void> {
  if (isPlatformRunning()) {
    console.log("Autopilot already enabled.");
    return;
  }
  await registerPlatform();
  console.log("Autopilot enabled.");
}

export async function stopDaemon(): Promise<void> {
  if (!isPlatformRunning()) {
    console.log("Autopilot not running.");
    return;
  }
  await unregisterPlatform();
  console.log("Autopilot disabled.");
}

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

        if (config.azure_default_autopilot !== true) continue;

        if (!config.azure_default_remember_me || !config.azure_default_password) {
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

export { isPlatformRunning } from "./daemonPlatform";
