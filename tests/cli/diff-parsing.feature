Feature: Git diff hunk parsing

  The CLI parses unified diff output to build a filter
  with line-level spans for each changed file.

  Scenario: Single hunk produces one span
    Given a diff with one hunk adding lines 10 to 15 in "app.ts"
    When the diff is parsed into a filter
    Then the filter maps "app.ts" to a span from line 10 to 15

  Scenario: Multiple hunks in one file produce multiple spans
    Given a diff with hunks adding lines 5 to 10 and 30 to 35 in "app.ts"
    When the diff is parsed into a filter
    Then the filter maps "app.ts" to two spans

  Scenario: Deletion-only hunk produces no span
    Given a diff with a hunk that only deletes lines in "old.ts"
    When the diff is parsed into a filter
    Then the filter maps "old.ts" to an empty span list

  Scenario: New file maps to whole-file
    Given a diff showing "new-file.ts" as entirely new
    When the diff is parsed into a filter
    Then the filter maps "new-file.ts" to whole-file

  Scenario: Multiple files each get their own spans
    Given a diff with changes in "a.ts" and "b.ts"
    When the diff is parsed into a filter
    Then the filter contains entries for both files

  Scenario: Single-line addition produces a one-line span
    Given a diff adding one line at line 42 in "fix.ts"
    When the diff is parsed into a filter
    Then the filter maps "fix.ts" to a span from line 42 to 43
