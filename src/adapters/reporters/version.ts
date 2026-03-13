import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the package version from the nearest package.json.
 * Falls back to "0.0.0" when the file cannot be located (e.g. bundled builds).
 */
export function readPackageVersion(): string {
  try {
    const __dirname = fileURLToPath(new URL(".", import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
