Feature: Config file defaults

  Users can set persistent defaults in crap4ts.config.ts so they
  don't have to pass the same flags on every invocation. Config file
  values are overridden by environment variables and CLI flags.

  Environment variable support: only format (CRAP4TS_FORMAT),
  threshold (CRAP4TS_THRESHOLD), and coverage path (CRAP4TS_COVERAGE)
  have env var equivalents. Fields like sort, breakdown, top, and
  summary are config-file or CLI only.

  The "crap4ts" key in package.json is also supported as an
  alternative to a dedicated config file.

  # --- Schema validation ---

  Scenario: Config file accepts all valid fields
    Given a config file with format, src, breakdown, sort, top, and summary
    When the config file is loaded
    Then all fields are accepted without error

  Scenario: Config file rejects invalid format value
    Given a config file with format set to "xml"
    When the config file is loaded
    Then crap4ts reports a validation error for format

  Scenario: Config file rejects invalid breakdown value
    Given a config file with breakdown set to "none"
    When the config file is loaded
    Then crap4ts reports a validation error for breakdown

  Scenario: Config file rejects invalid sort value
    Given a config file with sort set to "date"
    When the config file is loaded
    Then crap4ts reports a validation error for sort

  Scenario: Config file rejects non-positive top value
    Given a config file with top set to 0
    When the config file is loaded
    Then crap4ts reports that top must be a positive integer

  Scenario: Config file rejects non-integer top value
    Given a config file with top set to 2.5
    When the config file is loaded
    Then crap4ts reports that top must be a positive integer

  Scenario: Config file accepts src as a single string
    Given a config file with src set to "src"
    When the config file is loaded
    Then src is accepted as a string

  Scenario: Config file accepts src as an array of strings
    Given a config file with src set to ["src", "lib"]
    When the config file is loaded
    Then src is accepted as an array

  Scenario: Malformed config file produces a clear error
    Given a config file that contains invalid syntax
    When crap4ts is invoked
    Then an error is produced indicating the config file cannot be loaded
    And the exit code is non-zero

  # --- Priority cascade: defaults < file < env < CLI ---

  Scenario: Config file format is used when no CLI flag is given
    Given a config file with format set to "json"
    When crap4ts is invoked without a --format flag
    Then the output is JSON format

  Scenario: CLI format overrides config file format
    Given a config file with format set to "json"
    When crap4ts is invoked with --format markdown
    Then the output is markdown format

  Scenario: Environment variable format overrides config file format
    Given a config file with format set to "table"
    And the CRAP4TS_FORMAT environment variable is set to "json"
    When crap4ts is invoked without a --format flag
    Then the output is JSON format

  Scenario: CLI format overrides both env and config file
    Given a config file with format set to "table"
    And the CRAP4TS_FORMAT environment variable is set to "json"
    When crap4ts is invoked with --format markdown
    Then the output is markdown format

  Scenario: Environment variables do not affect sort, breakdown, top, or summary
    Given a config file with sort set to "complexity"
    And no environment variable exists for sort
    When crap4ts is invoked without a --sort flag
    Then the config file sort value is used

  # --- Config file src ---

  Scenario: Config file src is used when no CLI flag is given
    Given a config file with src set to ["src"]
    And the "src" directory contains TypeScript files
    When crap4ts is invoked without a --src flag
    Then only files under "src" are analyzed

  Scenario: CLI src replaces config file src entirely
    Given a config file with src set to ["src", "lib"]
    And the "lib" directory contains TypeScript files
    When crap4ts is invoked with --src lib
    Then only files under "lib" are analyzed

  # --- Config file breakdown ---

  Scenario: Config file breakdown is used when no CLI flag is given
    Given a config file with breakdown set to "all"
    When crap4ts is invoked without a --breakdown flag
    Then the resolved breakdown mode is "all"

  Scenario: CLI breakdown overrides config file breakdown
    Given a config file with breakdown set to "all"
    When crap4ts is invoked with --breakdown exceeding
    Then the resolved breakdown mode is "exceeding"

  # --- Config file sort and top ---

  Scenario: Config file sort is used when no CLI flag is given
    Given a config file with sort set to "complexity"
    And a codebase with functions of distinct complexity values
    When crap4ts is invoked without a --sort flag
    Then functions are ordered by complexity descending

  Scenario: CLI sort overrides config file sort
    Given a config file with sort set to "complexity"
    When crap4ts is invoked with --sort name
    Then functions are ordered by name ascending

  Scenario: Config file top limits output when no CLI flag is given
    Given a config file with top set to 3
    And a codebase with 10 functions
    When crap4ts is invoked without a --top flag
    Then at most 3 functions appear in the output

  Scenario: CLI top overrides config file top
    Given a config file with top set to 3
    And a codebase with 10 functions
    When crap4ts is invoked with --top 5
    Then at most 5 functions appear in the output

  # --- Config file summary ---

  Scenario: Config file summary enables summary-only output
    Given a config file with summary set to true
    When crap4ts is invoked without a --summary flag
    Then only the summary line is shown

  Scenario: Config file summary false produces full output
    Given a config file with summary set to false
    When crap4ts is invoked without a --summary flag
    Then the full function table is shown

  # --- Default behavior when fields are omitted ---

  Scenario: Omitted config fields fall back to built-in defaults
    Given a config file with only threshold set
    When crap4ts is invoked
    Then the output uses the default table format
    And all functions appear in the output
    And functions are in discovery order

  # --- Init template ---

  Scenario: Init command scaffolds config with new fields as comments
    When crap4ts init is run in an empty directory
    Then the generated config file contains active threshold, coverageMetric, and exclude fields
    And the generated config file contains commented-out lines for format, src, breakdown, sort, top, and summary
