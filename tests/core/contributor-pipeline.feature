Feature: Contributor pipeline carry

  Contributors flow from complexity extraction through scoring
  to the final analysis result. Every scored function carries
  its contributors regardless of breakdown mode.

  # --- analyze() path ---

  Scenario: Contributors appear on scored functions in analysis result
    Given source files with functions of varying complexity
    And coverage data for those functions
    When analysis is performed
    Then every scored function in the result has a contributors array

  Scenario: Contributors are carried from complexity to scored function
    Given a function with complexity 4 and 3 contributors
    And coverage data matching that function
    When analysis is performed
    Then the scored function has the same 3 contributors

  Scenario: Simple function carries empty contributors through pipeline
    Given a function with complexity 1 and 0 contributors
    And coverage data matching that function
    When analysis is performed
    Then the scored function has an empty contributors array

  # --- analyzeFile() path ---

  Scenario: Contributors appear on scored functions via file analysis
    Given a single source file with functions
    And coverage data for that file
    When file analysis is performed
    Then every scored function has a contributors array

  # --- Unmatched functions ---

  Scenario: Unmatched complexity functions retain contributors
    Given a function with contributors but no matching coverage
    When analysis is performed
    Then the unmatched function entry retains its contributors

  # --- Invariant preserved through pipeline ---

  Scenario: Contributor count invariant holds after scoring
    Given a function with complexity 6
    And coverage data matching that function
    When analysis is performed
    Then the scored function has exactly 5 contributors
