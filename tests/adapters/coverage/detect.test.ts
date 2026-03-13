import { describe, it, expect } from "vitest";
import { detectCoverageFormat } from "../../../src/adapters/coverage/detect.js";

describe("detectCoverageFormat", () => {
  it("detects Istanbul format (object keyed by file paths)", () => {
    const data = {
      "/path/to/file.ts": {
        path: "/path/to/file.ts",
        fnMap: {},
        f: {},
        statementMap: {},
        s: {},
        branchMap: {},
        b: {},
      },
    };
    expect(detectCoverageFormat(data)).toBe("istanbul");
  });

  it("detects V8 format (object with result array)", () => {
    const data = {
      result: [
        { scriptId: "1", url: "file:///path/to/file.ts", functions: [] },
      ],
    };
    expect(detectCoverageFormat(data)).toBe("v8");
  });

  it("detects V8 format (top-level array)", () => {
    const data = [
      { scriptId: "1", url: "file:///path/to/file.ts", functions: [] },
    ];
    expect(detectCoverageFormat(data)).toBe("v8");
  });

  it("returns unknown for unrecognized structure", () => {
    expect(detectCoverageFormat({ foo: "bar" })).toBe("unknown");
    expect(detectCoverageFormat(42)).toBe("unknown");
    expect(detectCoverageFormat(null)).toBe("unknown");
  });

  it("returns unknown for string content (LCOV)", () => {
    expect(detectCoverageFormat("SF:file.ts\nDA:1,1\nend_of_record\n")).toBe(
      "unknown",
    );
  });
});
