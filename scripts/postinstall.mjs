import { install, detectBrowserPlatform, resolveBuildId, Browser } from "@puppeteer/browsers";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, "..", ".browsers");
const platform = detectBrowserPlatform();

const buildId = await resolveBuildId(Browser.CHROME, platform, "stable");
console.log(`Installing Chrome ${buildId} for ${platform}...`);
const result = await install({ browser: Browser.CHROME, buildId, cacheDir });
console.log(`Chrome installed: ${result.executablePath}`);
