import {
  install,
  detectBrowserPlatform,
  resolveBuildId,
  computeExecutablePath,
  Browser,
  Cache,
} from "@puppeteer/browsers";
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { existsSync, chmodSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, "..", ".browsers");
const platform = detectBrowserPlatform();

const buildId = await resolveBuildId(Browser.CHROME, platform, "stable");
console.log(`Installing Chrome ${buildId} for ${platform}...`);

const executablePath = computeExecutablePath({
  browser: Browser.CHROME,
  buildId,
  cacheDir,
  platform,
});

if (existsSync(executablePath)) {
  console.log(`Chrome already installed: ${executablePath}`);
} else {
  // @puppeteer/browsers extracts zips via extract-zip/yauzl, whose
  // completion callback can be lost for some zip entries (e.g. the
  // symlinks inside Chrome for Testing's macOS app bundle), leaving the
  // install() promise unsettled forever. Download the archive only and
  // extract it ourselves with the system unzip, which handles symlinks
  // correctly.
  const archivePath = await install({
    browser: Browser.CHROME,
    buildId,
    cacheDir,
    platform,
    unpack: false,
  });
  const outputDir = new Cache(cacheDir).installationDir(
    Browser.CHROME,
    platform,
    buildId
  );
  execFileSync("unzip", ["-q", "-o", archivePath, "-d", outputDir]);
  chmodSync(executablePath, 0o755);
  console.log(`Chrome installed: ${executablePath}`);
}
