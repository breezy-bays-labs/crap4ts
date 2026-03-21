Feature: Auto-detecting coverage port factory

  The factory createAutoDetectCoveragePort(cwd?) returns a CoveragePort
  that detects coverage format and dispatches to the correct adapter.
  It replaces the former AutoDetectCoverageAdapter class.

  # --- Factory creation ---

  Scenario: Factory creates a valid CoveragePort
    When the factory is called without cwd
    Then the returned object implements CoveragePort
    And its parse method accepts data and optional sources

  Scenario: Factory with cwd creates adapters using that cwd
    When the factory is called with cwd "/project"
    Then the returned port resolves file paths relative to "/project"

  # --- Format dispatch ---

  Scenario: Port dispatches Istanbul data to Istanbul adapter
    Given the factory-created port
    And Istanbul-formatted coverage data
    When parse is called
    Then the Istanbul adapter processes the data

  Scenario: Port dispatches V8 data to V8 adapter
    Given the factory-created port
    And V8-formatted coverage data
    When parse is called
    Then the V8 adapter processes the data

  Scenario: Port throws UnsupportedFormatError for unknown data
    Given the factory-created port
    And data with no recognizable coverage format
    When parse is called
    Then an UnsupportedFormatError is thrown

  # --- Sources passed uniformly ---

  Scenario: Sources are forwarded to Istanbul adapter
    Given the factory-created port
    And Istanbul-formatted coverage data
    And a sources map
    When parse is called with sources
    Then the Istanbul adapter receives the sources parameter

  Scenario: Sources are forwarded to V8 adapter
    Given the factory-created port
    And V8-formatted coverage data
    And a sources map
    When parse is called with sources
    Then the V8 adapter receives the sources parameter

  # --- Integration with defaults ---

  Scenario: Default dependencies use the factory port
    When default dependencies are created for a project
    Then the coverage port is created via the factory
    And the port detects format and dispatches correctly

  Scenario: analyze() works through the factory-created port
    Given a project with source files and coverage data
    When analysis is run with default dependencies
    Then coverage is parsed through the factory port
    And analysis results contain scored functions
