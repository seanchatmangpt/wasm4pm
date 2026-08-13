
Feature: Hello World Print

  Scenario Outline: Print the approved observable output
    Given the program is run
    When the program is run
    Then the program output is exactly "<output>"

    Examples:
      | output       |
      | hello world. |
