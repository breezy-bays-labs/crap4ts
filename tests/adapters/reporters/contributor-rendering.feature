Feature: Contributor rendering in reporters

  The JSON reporter renders contributors based on the breakdown mode
  injected at construction. Table and markdown reporters ignore
  contributors in v1.

  # --- JSON reporter: breakdown mode filtering ---

  Scenario: JSON reporter with mode "all" includes contributors on every function
    Given an analysis result with 3 functions, 2 exceeding threshold
    And the JSON reporter is constructed with breakdown mode "all"
    When the result is formatted
    Then all 3 functions in the JSON output have a "contributors" field

  Scenario: JSON reporter with mode "exceeding" includes contributors only on exceeding functions
    Given an analysis result with 3 functions, 2 exceeding threshold
    And the JSON reporter is constructed with breakdown mode "exceeding"
    When the result is formatted
    Then the 2 exceeding functions have a "contributors" field
    And the non-exceeding function does not have a "contributors" field

  Scenario: JSON reporter with mode "off" omits contributors from all functions
    Given an analysis result with functions that have contributors
    And the JSON reporter is constructed with breakdown mode "off"
    When the result is formatted
    Then no functions in the JSON output have a "contributors" field

  # --- JSON key presence contract (undefined vs [] vs absent) ---

  Scenario: CC=1 function has empty contributors array when breakdown is active
    Given a function with complexity 1 and 0 contributors
    And the JSON reporter is constructed with breakdown mode "all"
    When the result is formatted
    Then the function in JSON has a "contributors" key with an empty array

  Scenario: Contributors key is absent from JSON when breakdown mode is off
    Given a function with contributors on the scored function
    And the JSON reporter is constructed with breakdown mode "off"
    When the result is formatted
    Then the function in JSON does not contain the "contributors" key

  Scenario: Non-exceeding function has no contributors key in exceeding mode
    Given an analysis result with a non-exceeding function that has contributors
    And the JSON reporter is constructed with breakdown mode "exceeding"
    When the result is formatted
    Then the non-exceeding function in JSON does not contain the "contributors" key

  # --- selectContributors domain helper ---

  Scenario: selectContributors returns contributors for exceeding function in exceeding mode
    Given a function verdict that exceeds the threshold with 3 contributors
    When selectContributors is called with mode "exceeding"
    Then 3 contributors are returned

  Scenario: selectContributors returns empty for non-exceeding function in exceeding mode
    Given a function verdict that does not exceed the threshold with 3 contributors
    When selectContributors is called with mode "exceeding"
    Then an empty array is returned

  Scenario: selectContributors returns contributors for any function in all mode
    Given a function verdict that does not exceed the threshold with 3 contributors
    When selectContributors is called with mode "all"
    Then 3 contributors are returned

  Scenario: selectContributors returns empty for any function in off mode
    Given a function verdict with 3 contributors
    When selectContributors is called with mode "off"
    Then an empty array is returned

  # --- JSON output shape ---

  Scenario: Contributors in JSON include kind, line, and column
    Given a function with an if-branch contributor on line 10 column 4
    And the JSON reporter is constructed with breakdown mode "all"
    When the result is formatted
    Then the contributor in JSON has kind "if-branch", line 10, and column 4

  Scenario: Logical operator contributors in JSON include operator field
    Given a function with a logical-operator contributor with operator "&&"
    And the JSON reporter is constructed with breakdown mode "all"
    When the result is formatted
    Then the contributor in JSON has an "operator" field with value "&&"

  Scenario: Non-logical contributors in JSON omit operator field
    Given a function with an if-branch contributor
    And the JSON reporter is constructed with breakdown mode "all"
    When the result is formatted
    Then the contributor in JSON does not have an "operator" field

  # --- Table and markdown reporters ---

  Scenario: Console reporter output is unchanged regardless of breakdown mode
    Given an analysis result with contributors
    And the console reporter is constructed with breakdown mode "all"
    When the result is formatted
    Then the output matches the format without breakdown

  Scenario: Markdown reporter output is unchanged regardless of breakdown mode
    Given an analysis result with contributors
    And the markdown reporter is constructed with breakdown mode "all"
    When the result is formatted
    Then the output matches the format without breakdown
