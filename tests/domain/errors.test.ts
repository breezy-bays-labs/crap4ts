import { describe, it, expect } from "vitest";
import {
  InvalidComplexityError,
  InvalidCoverageError,
} from "../../src/domain/types.js";
import { ComplexityExtractionError } from "../../src/adapters/complexity/facade.js";
import {
  CoverageParseError,
  UnsupportedFormatError,
} from "../../src/adapters/coverage/facade.js";

describe("InvalidComplexityError", () => {
  it("has correct name property", () => {
    const error = new InvalidComplexityError(0);
    expect(error.name).toBe("InvalidComplexityError");
  });

  it("includes the invalid value in message", () => {
    const error = new InvalidComplexityError(-1);
    expect(error.message).toContain("-1");
  });
});

describe("InvalidCoverageError", () => {
  it("has correct name property", () => {
    const error = new InvalidCoverageError(NaN);
    expect(error.name).toBe("InvalidCoverageError");
  });

  it("includes the invalid value in message", () => {
    const error = new InvalidCoverageError(Infinity);
    expect(error.message).toContain("Infinity");
  });
});

describe("ComplexityExtractionError", () => {
  it("has correct name property", () => {
    const error = new ComplexityExtractionError("src/app.ts");
    expect(error.name).toBe("ComplexityExtractionError");
  });

  it("includes file path in message", () => {
    const error = new ComplexityExtractionError("src/app.ts");
    expect(error.message).toContain("src/app.ts");
  });

  it("exposes filePath as structured field", () => {
    const error = new ComplexityExtractionError("src/app.ts");
    expect(error.filePath).toBe("src/app.ts");
  });

  it("chains cause from original parse error", () => {
    const cause = new SyntaxError("Unexpected token");
    const error = new ComplexityExtractionError("src/app.ts", { cause });
    expect(error.cause).toBe(cause);
  });

  it("is an instance of Error", () => {
    const error = new ComplexityExtractionError("src/app.ts");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("CoverageParseError", () => {
  it("has correct name property", () => {
    const error = new CoverageParseError("Failed to parse");
    expect(error.name).toBe("CoverageParseError");
  });

  it("uses provided message", () => {
    const error = new CoverageParseError("Failed to read coverage file: /bad/path.json");
    expect(error.message).toBe("Failed to read coverage file: /bad/path.json");
  });

  it("exposes filePath as structured field when provided", () => {
    const error = new CoverageParseError("Failed to read", "/bad/path.json");
    expect(error.filePath).toBe("/bad/path.json");
  });

  it("filePath is undefined when not provided", () => {
    const error = new CoverageParseError("generic error");
    expect(error.filePath).toBeUndefined();
  });

  it("chains cause from I/O error", () => {
    const cause = new Error("ENOENT: no such file");
    const error = new CoverageParseError("Failed to read", undefined, { cause });
    expect(error.cause).toBe(cause);
  });

  it("chains cause from JSON parse error", () => {
    const cause = new SyntaxError("Unexpected end of JSON input");
    const error = new CoverageParseError("Invalid JSON", undefined, { cause });
    expect(error.cause).toBe(cause);
  });

  it("is an instance of Error", () => {
    const error = new CoverageParseError("msg");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("UnsupportedFormatError", () => {
  it("has correct name property", () => {
    const error = new UnsupportedFormatError();
    expect(error.name).toBe("UnsupportedFormatError");
  });

  it("has descriptive message about expected formats", () => {
    const error = new UnsupportedFormatError();
    expect(error.message).toMatch(/istanbul/i);
    expect(error.message).toMatch(/v8/i);
  });

  it("includes detail about what was received when provided", () => {
    const error = new UnsupportedFormatError("plain number");
    expect(error.message).toContain("Got: plain number");
  });

  it("is an instance of Error", () => {
    const error = new UnsupportedFormatError();
    expect(error).toBeInstanceOf(Error);
  });
});
