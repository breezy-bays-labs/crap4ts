Feature: Complexity contributor collection

  Contributors are always collected during complexity extraction.
  Each decision point produces a contributor with a domain-level kind,
  source position, and optional operator.

  Background:
    Given a TypeScript source file

  # --- Invariant: contributors.length === CC - 1 ---

  Scenario: Simple function has empty contributors
    Given source containing a function with no branches
    When complexity is extracted
    Then the function has complexity 1
    And the function has 0 contributors

  Scenario: Contributors count equals complexity minus one
    Given source containing a function with an if-else and a for loop
    When complexity is extracted
    Then the function has complexity 3
    And the function has 2 contributors

  # --- ContributorKind mapping ---

  Scenario: If statement produces if-branch contributor
    Given source containing a function with an if statement on line 2
    When complexity is extracted
    Then a contributor with kind "if-branch" appears on line 2

  Scenario: Ternary expression produces ternary contributor
    Given source containing a function with a ternary expression on line 2
    When complexity is extracted
    Then a contributor with kind "ternary" appears on line 2

  Scenario: For loop produces for-loop contributor
    Given source containing a function with a for loop on line 2
    When complexity is extracted
    Then a contributor with kind "for-loop" appears on line 2

  Scenario: For-in loop produces for-loop contributor
    Given source containing a function with a for-in loop on line 2
    When complexity is extracted
    Then a contributor with kind "for-loop" appears on line 2

  Scenario: For-of loop produces for-loop contributor
    Given source containing a function with a for-of loop on line 2
    When complexity is extracted
    Then a contributor with kind "for-loop" appears on line 2

  Scenario: While loop produces while-loop contributor
    Given source containing a function with a while loop on line 2
    When complexity is extracted
    Then a contributor with kind "while-loop" appears on line 2

  Scenario: Do-while loop produces do-while-loop contributor
    Given source containing a function with a do-while loop on line 2
    When complexity is extracted
    Then a contributor with kind "do-while-loop" appears on line 2

  Scenario: Catch clause produces catch contributor
    Given source containing a function with a try-catch on line 2
    When complexity is extracted
    Then a contributor with kind "catch" appears on line 2

  Scenario: Switch case produces case-branch contributor
    Given source containing a function with a switch and 2 non-default cases
    When complexity is extracted
    Then 2 contributors with kind "case-branch" appear

  Scenario: Default case and empty fall-through cases are not counted
    Given source containing a function with a switch having a default case and an empty fall-through
    When complexity is extracted
    Then no contributors with kind "case-branch" appear for the default or empty cases

  # --- Logical operators with operator field ---

  Scenario: Logical AND produces logical-operator contributor with operator
    Given source containing a function with "a && b" on line 2
    When complexity is extracted
    Then a contributor with kind "logical-operator" and operator "&&" appears on line 2

  Scenario: Logical OR produces logical-operator contributor with operator
    Given source containing a function with "a || b" on line 2
    When complexity is extracted
    Then a contributor with kind "logical-operator" and operator "||" appears on line 2

  Scenario: Nullish coalescing produces logical-operator contributor with operator
    Given source containing a function with "a ?? b" on line 2
    When complexity is extracted
    Then a contributor with kind "logical-operator" and operator "??" appears on line 2

  Scenario: Optional chain produces optional-chain contributor with operator
    Given source containing a function with "a?.b" on line 2
    When complexity is extracted
    Then a contributor with kind "optional-chain" and operator "?." appears on line 2

  # --- Else-if chains ---

  Scenario: Else-if chain produces one if-branch contributor per condition
    Given source containing a function with if, else-if, else-if, else
    When complexity is extracted
    Then 3 contributors with kind "if-branch" appear

  # --- Multiple contributors on same line ---

  Scenario: Multiple contributors on the same line are preserved
    Given source containing a function with "if (a && b)" on line 2
    When complexity is extracted
    Then 2 contributors appear on line 2
    And one has kind "if-branch" and the other has kind "logical-operator"

  # --- Source ordering ---

  Scenario: Contributors are ordered by source position
    Given source containing a function with an if on line 2 and a for loop on line 5
    When complexity is extracted
    Then the first contributor is on line 2
    And the second contributor is on line 5

  # --- Column disambiguation ---

  Scenario: Contributors include column for disambiguation
    Given source containing a function with "a && b" on line 2 column 10
    When complexity is extracted
    Then the contributor has line 2 and a column value

  # --- Existing behavior preserved ---

  Scenario: Complexity counts are unchanged by contributor collection
    Given source containing a function with known complexity 5
    When complexity is extracted
    Then the function has complexity 5
    And the function has 4 contributors
