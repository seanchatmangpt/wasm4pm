import fs from "node:fs";
import path from "node:path";

/**
 * lib/version.ts - Shared version utility for TypeScript release scripts
 */

export function packageVersion(): string {
  const pkgPath = path.resolve(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (!pkg.version) throw new Error("package.json missing version");
  return pkg.version;
}

export function releaseTag(version = packageVersion()): string {
  return `v${version}`;
}

export function releaseCertificatePath(version = packageVersion()): string {
  return `RELEASE_CERTIFICATE.v${version}.json`;
}

export function postPublishReceiptPath(version = packageVersion()): string {
  return `POST_PUBLISH_RECEIPT.v${version}.json`;
}
