/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Hexagonal: domain/ imports NOTHING from other layers ──
    {
      name: "domain-no-outward-deps",
      comment: "Domain must not import from ports, adapters, core, or cli",
      severity: "error",
      from: { path: "^src/domain/" },
      to: {
        path: "^src/(ports|adapters|core|cli)/",
      },
    },
    // ── Hexagonal: domain/ must not use Node APIs ──
    {
      name: "domain-no-node-apis",
      comment: "Domain must be pure — no Node built-in imports",
      severity: "error",
      from: { path: "^src/domain/" },
      to: {
        path: "^node:",
      },
    },
    // ── Hexagonal: ports/ only import from domain ──
    {
      name: "ports-only-import-domain",
      comment: "Ports may only import from domain (types)",
      severity: "error",
      from: { path: "^src/ports/" },
      to: {
        path: "^src/(adapters|core|cli)/",
      },
    },
    // ── Hexagonal: adapters/ must not import from core or cli ──
    {
      name: "adapters-no-core-or-cli",
      comment: "Adapters implement ports, must not import core or cli",
      severity: "error",
      from: { path: "^src/adapters/" },
      to: {
        path: "^src/(core|cli)/",
      },
    },
    // ── Hexagonal: core/ must not import from cli ──
    {
      name: "core-no-cli",
      comment: "Core must not import from cli",
      severity: "error",
      from: { path: "^src/core/" },
      to: {
        path: "^src/cli/",
      },
    },
    // ── No circular dependencies ──
    {
      name: "no-circular",
      comment: "No circular dependencies allowed",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
