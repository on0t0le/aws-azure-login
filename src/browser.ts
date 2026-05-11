import {
  computeExecutablePath,
  detectBrowserPlatform,
  Browser,
} from "@puppeteer/browsers";
import path from "path";
import { existsSync, readdirSync } from "fs";

const browsersDir = path.join(__dirname, "..", ".browsers");

export function getBrowserExecutablePath(): string | undefined {
  const chromeDir = path.join(browsersDir, "chrome");
  if (!existsSync(chromeDir)) return undefined;

  const platform = detectBrowserPlatform();
  if (!platform) return undefined;

  const entries = readdirSync(chromeDir).filter((e) =>
    e.startsWith(`${platform}-`)
  );
  if (entries.length === 0) return undefined;

  const sorted = entries.sort();
  const latest = sorted[sorted.length - 1];
  const buildId = latest.slice(`${platform}-`.length);

  const executablePath = computeExecutablePath({
    browser: Browser.CHROME,
    buildId,
    cacheDir: browsersDir,
    platform,
  });

  return existsSync(executablePath) ? executablePath : undefined;
}
