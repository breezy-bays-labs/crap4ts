Feature: Analysis pipeline with diff filtering

  When a filter is provided, only functions whose spans
  overlap changed lines are scored. The rest of the
  pipeline remains unchanged.

  Scenario: Only changed functions are scored
    Given a source file with three functions
    And a filter indicating changes inside the second function only
    When analysis is run with the filter
    Then only the second function appears in the results

  Scenario: No filter scores all functions
    Given a source file with three functions
    And no filter is provided
    When analysis is run
    Then all three functions appear in the results

  Scenario: Whole-file filter scores all functions in that file
    Given a source file with three functions
    And a filter marking the file as whole-file changed
    When analysis is run with the filter
    Then all three functions appear in the results

  Scenario: Functions in unchanged files are excluded
    Given two source files with functions in each
    And a filter that only includes the first file
    When analysis is run with the filter
    Then only functions from the first file appear in the results
