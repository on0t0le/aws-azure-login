#!/usr/bin/env node

process.on("SIGINT", () => process.exit(1));
process.on("SIGTERM", () => process.exit(1));

import { Command } from "commander";
import { configureProfileAsync } from "./configureProfileAsync";
import { login } from "./login";

const program = new Command();

program
  .option(
    "-p, --profile <name>",
    "The name of the profile to log in with (or configure)"
  )
  .option("-a, --all-profiles", "Run for all configured profiles")
  .option(
    "-f, --force-refresh",
    "Force a credential refresh, even if they are still valid"
  )
  .option("-c, --configure", "Configure the profile")
  .option(
    "-m, --mode <mode>",
    "'cli' to hide the login page and perform the login through the CLI (default behavior), 'gui' to perform the login through the Azure GUI (more reliable but only works on GUI operating system), 'debug' to show the login page but perform the login through the CLI (useful to debug issues with the CLI login)"
  )
  .option(
    "--no-sandbox",
    "Disable the Puppeteer sandbox (usually necessary on Linux)"
  )
  .option(
    "--no-prompt",
    "Do not prompt for input and accept the default choice",
    false
  )
  .option(
    "--enable-chrome-network-service",
    "Enable Chromium's Network Service (needed when login provider redirects with 3XX)"
  )
  .option(
    "--no-verify-ssl",
    "Disable SSL Peer Verification for connections to AWS (no effect if behind proxy)"
  )
  .option(
    "--enable-chrome-seamless-sso",
    "Enable Chromium's pass-through authentication with Azure Active Directory Seamless Single Sign-On"
  )
  .option(
    "--no-disable-extensions",
    "Tell Puppeteer not to pass the --disable-extensions flag to Chromium"
  )
  .option(
    "--disable-gpu",
    "Tell Puppeteer to pass the --disable-gpu flag to Chromium"
  )
  .option(
    "--autopilot",
    "Start the autopilot background service [EXPERIMENTAL]"
  )
  .option("--no-autopilot", "Stop the autopilot background service")
  .option(
    "--autopilot-worker",
    "Internal: run the autopilot watch loop (do not call directly)"
  )
  .parse(process.argv);

const options = program.opts();

const profileName =
  (options.profile as string | undefined) ||
  process.env.AWS_PROFILE ||
  "default";
const mode = (options.mode as string | undefined) || "cli";
const disableSandbox = !options.sandbox;
const noPrompt = !options.prompt;
const enableChromeNetworkService = !!options.enableChromeNetworkService;
const awsNoVerifySsl = !options.verifySsl;
const enableChromeSeamlessSso = !!options.enableChromeSeamlessSso;
const forceRefresh = !!options.forceRefresh;
const noDisableExtensions = !options.disableExtensions;
const disableGpu = !!options.disableGpu;

Promise.resolve()
  .then(async () => {
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
