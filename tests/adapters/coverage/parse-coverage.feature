Feature: Parse coverage data via sync and async entry points

  The coverage facade provides two entry points:
  - parseCoverage(data, options?) — synchronous, operates on pre-parsed JSON
  - parseCoverageFile(path, options?) — async, reads file then delegates

  # --- Sync: parseCoverage(data) ---

  Scenario: Parse Istanbul coverage from a data object
    Given Istanbul coverage data loaded in memory
    When coverage is parsed synchronously
    Then coverage data is returned as a map keyed by file path
    And warnings are empty

  Scenario: Parse V8 coverage from a data object
    Given V8 coverage data loaded in memory as an array
    When coverage is parsed synchronously
    Then coverage data is returned as a map keyed by file path

  Scenario: Parse V8 coverage from a result-wrapped object
    Given V8 coverage data loaded in memory as a result object
    When coverage is parsed synchronously
    Then coverage data is returned as a map keyed by file path

  # --- Async: parseCoverageFile(path) ---

  Scenario: Parse Istanbul coverage from a file path
    Given an Istanbul coverage JSON file at "coverage/coverage-final.json"
    When coverage is parsed from the file path asynchronously
    Then coverage data is returned as a map keyed by file path
    And warnings are empty

  Scenario: Parse V8 coverage from a file path
    Given a V8 coverage JSON file at "coverage/v8-coverage.json"
    When coverage is parsed from the file path asynchronously
    Then coverage data is returned as a map keyed by file path

  Scenario: Async file parsing delegates to sync parsing
    Given a valid coverage JSON file
    When coverage is parsed from the file path asynchronously
    Then the result is identical to parsing the same data synchronously

  # --- Format detection ---

  Scenario: Format is auto-detected when not specified
    Given Istanbul coverage data
    When coverage is parsed without specifying a format
    Then the Istanbul format is detected and used

  Scenario: Explicit format overrides auto-detection
    Given coverage data that could be either format
    When coverage is parsed with format "istanbul"
    Then the Istanbul adapter is used regardless of content

  # --- Sources option ---

  Scenario: V8 coverage with sources uses accurate line mapping
    Given V8 coverage data
    And source content is provided for the covered files
    When coverage is parsed with the sources option
    Then line numbers use Tier 2 accuracy
    And no approximate-span warnings are emitted

  Scenario: V8 coverage without sources falls back to approximation
    Given V8 coverage data
    When coverage is parsed without the sources option
    Then an approximate-span warning is emitted

  Scenario: Sources are passed to both Istanbul and V8 adapters uniformly
    Given coverage data in any format
    And source content is provided
    When coverage is parsed with the sources option
    Then the sources are forwarded to the adapter regardless of format

  # --- cwd option ---

  Scenario: Parsing with cwd uses deterministic path resolution
    Given coverage data with absolute file paths
    And a cwd option of "/project/root"
    When coverage is parsed with the cwd option
    Then file paths in the result are relative to the cwd

  Scenario: Parsing without cwd uses heuristic path resolution
    Given coverage data with absolute file paths
    When coverage is parsed without a cwd option
    Then file paths are resolved using longest common prefix heuristic

  # --- Warnings ---

  Scenario: Warnings from the coverage adapter are passed through
    Given coverage data that triggers adapter warnings
    When coverage is parsed
    Then the warnings array contains the adapter warnings

  # --- Error handling (sync) ---

  Scenario: Unknown format throws UnsupportedFormatError
    Given data containing an unrecognizable structure
    When synchronous coverage parsing is attempted
    Then an UnsupportedFormatError is thrown
    And the error message explains the expected formats

  Scenario: Adapter failure wraps in CoverageParseError
    Given data that causes the adapter to fail
    When synchronous coverage parsing is attempted
    Then a CoverageParseError is thrown
    And the cause contains the original adapter error

  # --- Error handling (async) ---

  Scenario: File not found throws CoverageParseError
    Given a file path that does not exist
    When asynchronous coverage parsing is attempted
    Then a CoverageParseError is thrown
    And the error includes the file path

  Scenario: Invalid JSON throws CoverageParseError
    Given a file containing malformed JSON
    When asynchronous coverage parsing is attempted
    Then a CoverageParseError is thrown
    And the error includes the file path

  # --- Edge cases ---

  Scenario: Empty coverage data returns empty map
    Given Istanbul coverage data with no file entries
    When coverage is parsed
    Then the coverage map is empty
    And warnings are empty

  Scenario: Single-file coverage data parses correctly
    Given Istanbul coverage data for a single file
    When coverage is parsed
    Then the coverage map contains exactly one entry
