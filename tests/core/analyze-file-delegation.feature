Feature: analyzeFile delegates to convenience functions

  Scenario: analyzeFile uses extractComplexity for complexity extraction
    Given a source file with known functions
    When analyzeFile is called
    Then complexity is extracted via the extractComplexity facade

  Scenario: analyzeFile uses parseCoverage for coverage parsing
    Given a source file and a coverage file
    When analyzeFile is called with a coverage path
    Then coverage is parsed via the parseCoverage facade

  Scenario: analyzeFile passes source content as sources option
    Given a source file and V8 coverage data
    When analyzeFile is called
    Then parseCoverage receives the source content for accurate line mapping

  Scenario: Existing analyzeFile behavior is preserved
    Given a source file with two functions and Istanbul coverage
    When analyzeFile is called with default options
    Then verdicts are returned for both functions
    And the results match the previous implementation
