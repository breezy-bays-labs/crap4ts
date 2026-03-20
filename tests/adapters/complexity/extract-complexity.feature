Feature: Extract complexity from TypeScript source

  Background:
    Given a TypeScript source file

  # --- Happy paths ---

  Scenario: Extract complexity from a simple function
    Given source containing a function "greet" with no branches
    When complexity is extracted
    Then one function is returned with complexity 1

  Scenario: Extract complexity from a function with branches
    Given source containing a function "process" with an if-else and a for loop
    When complexity is extracted
    Then one function is returned with complexity 3

  Scenario: Extract complexity from multiple functions
    Given source containing functions "foo" and "bar"
    When complexity is extracted
    Then two functions are returned

  Scenario: Extract complexity from a class with methods
    Given source containing a class "Service" with methods "init" and "run"
    When complexity is extracted
    Then two functions are returned with qualified names "Service.init" and "Service.run"

  # --- File path is metadata ---

  Scenario: File path appears in function identity
    Given source containing a function "main"
    And the file path is "src/app.ts"
    When complexity is extracted
    Then the returned function identity has file path "src/app.ts"

  # --- Empty results ---

  Scenario: Source with no functions returns empty array
    Given source containing only type definitions and interfaces
    When complexity is extracted
    Then an empty array is returned

  Scenario: Empty source returns empty array
    Given empty source text
    When complexity is extracted
    Then an empty array is returned

  # --- Error handling ---

  Scenario: Invalid source throws ComplexityExtractionError
    Given source containing invalid TypeScript syntax
    When complexity extraction is attempted
    Then a ComplexityExtractionError is thrown
    And the error wraps the original parse error

  Scenario: Non-TypeScript content throws ComplexityExtractionError
    Given source containing raw binary content
    When complexity extraction is attempted
    Then a ComplexityExtractionError is thrown
