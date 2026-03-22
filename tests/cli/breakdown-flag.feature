Feature: --breakdown CLI flag

  The --breakdown flag controls which functions show complexity
  contributors in the output. It composes with existing flags
  and is JSON-only in v1.

  # --- Flag parsing ---

  Scenario: --breakdown without value defaults to exceeding mode
    When crap4ts is invoked with --breakdown -f json
    Then the breakdown mode is "exceeding"

  Scenario: --breakdown all sets mode to all
    When crap4ts is invoked with --breakdown all -f json
    Then the breakdown mode is "all"

  Scenario: No --breakdown flag defaults to off mode
    When crap4ts is invoked with -f json
    Then the breakdown mode is "off"

  Scenario: --breakdown with invalid value produces an error
    When crap4ts is invoked with --breakdown nonsense
    Then an error is produced indicating valid values are "all" or no value
    And the exit code is non-zero

  # --- JSON output integration ---

  Scenario: --breakdown produces contributors on exceeding functions in JSON
    Given a codebase with functions above and below the threshold
    When crap4ts is invoked with --breakdown -f json
    Then exceeding functions in the JSON output have contributors
    And non-exceeding functions do not have contributors

  Scenario: --breakdown all produces contributors on all functions in JSON
    Given a codebase with functions above and below the threshold
    When crap4ts is invoked with --breakdown all -f json
    Then all functions in the JSON output have contributors

  # --- Format interactions ---

  Scenario: --breakdown without -f json silently omits contributors
    Given a codebase with high-complexity functions
    When crap4ts is invoked with --breakdown
    Then the output is table format
    And no error is produced
    And contributors are not shown

  Scenario: --breakdown with -f markdown silently omits contributors
    Given a codebase with high-complexity functions
    When crap4ts is invoked with --breakdown -f markdown
    Then the output is markdown format
    And no error is produced

  # --- Suppression flags ---

  Scenario: --summary suppresses breakdown output
    Given a codebase with high-complexity functions
    When crap4ts is invoked with --breakdown --summary -f json
    Then only the summary line is shown
    And no contributors appear

  Scenario: --quiet suppresses all output including breakdown
    Given a codebase with high-complexity functions
    When crap4ts is invoked with --breakdown -q
    Then no output is produced
    And the exit code reflects pass or fail

  # --- Edge cases ---

  Scenario: --breakdown with no functions exceeding threshold produces no contributors
    Given a codebase where all functions are below the threshold
    When crap4ts is invoked with --breakdown -f json
    Then the JSON output contains functions
    And no function has a "contributors" field

  Scenario: --breakdown with no source files produces empty result
    Given a codebase with no TypeScript files
    When crap4ts is invoked with --breakdown -f json
    Then the JSON output has an empty functions array
    And no error is produced

  Scenario: --breakdown respects per-path threshold overrides
    Given a codebase with a function at CRAP 12
    And a per-path threshold of 8 for that function's file
    When crap4ts is invoked with --breakdown -f json
    Then the function exceeds its effective threshold
    And the function has contributors in the JSON output

  # --- Composition with existing flags ---

  Scenario: --breakdown composes with --top
    Given a codebase with 10 functions, 5 exceeding threshold
    When crap4ts is invoked with --breakdown --top 3 -f json
    Then at most 3 functions appear in the output
    And exceeding functions among them have contributors

  Scenario: --breakdown composes with --sort
    Given a codebase with functions of varying complexity
    When crap4ts is invoked with --breakdown --sort complexity -f json
    Then functions are sorted by complexity descending
    And exceeding functions have contributors

  Scenario: --breakdown composes with --changed-since
    Given a codebase with recent changes to some files
    When crap4ts is invoked with --breakdown --changed-since HEAD~1 -f json
    Then only changed functions appear
    And exceeding functions among them have contributors
