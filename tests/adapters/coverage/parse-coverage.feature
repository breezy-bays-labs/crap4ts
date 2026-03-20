Feature: Parse coverage data from files or pre-loaded objects

  # --- File path input ---

  Scenario: Parse Istanbul coverage from a file path
    Given an Istanbul coverage JSON file at "coverage/coverage-final.json"
    When coverage is parsed from the file path
    Then coverage data is returned as a map keyed by file path
    And warnings are empty

  Scenario: Parse V8 coverage from a file path
    Given a V8 coverage JSON file at "coverage/v8-coverage.json"
    When coverage is parsed from the file path
    Then coverage data is returned as a map keyed by file path

  # --- Pre-loaded data input ---

  Scenario: Parse Istanbul coverage from a pre-loaded object
    Given Istanbul coverage data loaded in memory
    When coverage is parsed from the data object
    Then coverage data is returned as a map keyed by file path

  Scenario: Parse V8 coverage from a pre-loaded array
    Given V8 coverage data loaded in memory as an array
    When coverage is parsed from the data object
    Then coverage data is returned as a map keyed by file path

  # --- Format detection ---

  Scenario: Format is auto-detected when not specified
    Given an Istanbul coverage JSON file
    When coverage is parsed without specifying a format
    Then the Istanbul adapter is used

  Scenario: Explicit format overrides auto-detection
    Given a coverage JSON file
    When coverage is parsed with format "istanbul"
    Then the Istanbul adapter is used regardless of file content

  # --- Sources option for V8 accuracy ---

  Scenario: V8 coverage with sources uses accurate line mapping
    Given a V8 coverage JSON file
    And source content is provided for the covered files
    When coverage is parsed with the sources option
    Then line numbers use Tier 2 accuracy
    And no approximate-span warnings are emitted

  Scenario: V8 coverage without sources falls back to approximation
    Given a V8 coverage JSON file
    When coverage is parsed without the sources option
    Then an approximate-span warning is emitted

  # --- Warnings always returned ---

  Scenario: Warnings from the coverage adapter are passed through
    Given a V8 coverage file that triggers adapter warnings
    When coverage is parsed
    Then the warnings array contains the adapter warnings

  # --- Error handling ---

  Scenario: Unknown format throws UnsupportedFormatError
    Given a JSON file containing an unrecognizable structure
    When coverage parsing is attempted
    Then an UnsupportedFormatError is thrown
    And the error message explains the expected formats

  Scenario: File not found throws CoverageParseError
    Given a file path that does not exist
    When coverage parsing is attempted
    Then a CoverageParseError is thrown

  Scenario: Invalid JSON throws CoverageParseError
    Given a file containing malformed JSON
    When coverage parsing is attempted
    Then a CoverageParseError is thrown

  Scenario: Format mismatch throws CoverageParseError
    Given an Istanbul coverage file
    When coverage is parsed with format "v8"
    Then a CoverageParseError is thrown
