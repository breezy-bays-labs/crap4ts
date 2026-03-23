import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the package version from the nearest package.json.
 * Falls back to "0.0.0" when the file cannot be located (e.g. bundled builds).
 */
export function readPackageVersion(): string {
  try {
    const startDir = fileURLToPath(new URL(".", import.meta.url));
    const pkg = JSON.parse(
      readFileSync(findPackageJson(startDir), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function findPackageJson(startDir: string): string {
  let currentDir = startDir;

  for (let i = 0; i < 5; i++) {
    const candidate = join(currentDir, "package.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    currentDir = dirname(currentDir);
  }

  throw new Error("package.json not found");
}
