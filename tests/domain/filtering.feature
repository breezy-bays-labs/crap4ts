Feature: Function-level diff filtering

  Functions should only be scored when their source lines overlap
  with lines that were added or modified in a diff.

  # --- Span overlap ---

  Scenario: Function spans overlap when they share lines
    Given a function spanning lines 5 to 15
    And a changed region spanning lines 10 to 20
    When checking for overlap
    Then the spans overlap

  Scenario: Function spans do not overlap when separated
    Given a function spanning lines 5 to 10
    And a changed region spanning lines 15 to 20
    When checking for overlap
    Then the spans do not overlap

  Scenario: Adjacent spans do not overlap under half-open convention
    Given a function spanning lines 5 to 10
    And a changed region spanning lines 10 to 15
    When checking for overlap
    Then the spans do not overlap

  Scenario: Single-line change inside a function
    Given a function spanning lines 1 to 50
    And a changed region spanning lines 25 to 26
    When checking for overlap
    Then the spans overlap

  # --- shouldInclude decisions ---

  Scenario: File not in the filter excludes all its functions
    Given a filter with no entry for "utils.ts"
    And a function in "utils.ts"
    When deciding whether to include the function
    Then the function is excluded

  Scenario: File mapped to null includes all its functions
    Given a filter where "utils.ts" maps to whole-file
    And a function in "utils.ts"
    When deciding whether to include the function
    Then the function is included

  Scenario: Function with changed lines inside it is included
    Given a filter where "service.ts" has changes on lines 10 to 15
    And a function in "service.ts" spanning lines 5 to 20
    When deciding whether to include the function
    Then the function is included

  Scenario: Function with no changed lines inside it is excluded
    Given a filter where "service.ts" has changes on lines 10 to 15
    And a function in "service.ts" spanning lines 50 to 60
    When deciding whether to include the function
    Then the function is excluded

  Scenario: File with only deletion hunks excludes all functions
    Given a filter where "cleanup.ts" has an empty change list
    And a function in "cleanup.ts" spanning lines 1 to 30
    When deciding whether to include the function
    Then the function is excluded
