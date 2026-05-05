# wasm4pm - Command Line Reference

wasm4pm: High-performance process mining CLI

wasm4pm is a high-performance command-line interface for process mining, focusing on nanosecond-latency event routing and analysis. It is part of the Vision 2030 architecture for real-time process intelligence.

## Global Options

- `verbose`: Show verbose output

## Commands

### `doctor`

Check the health of the system and dependencies

### `wizard`

Start the interactive project setup wizard

### `telco`

Telco routing and nanosecond architecture management

#### `status` Subcommand

Show the current telco status and nanosecond architecture metrics

#### `map` Subcommand

Visualize the 8-dimensional event flow map

#### `dispatch` Subcommand

Dispatch events through the high-performance telco router

- `-c --count`: Number of events to dispatch

### `mining`

Process mining operations (discover, conformance)

#### `discover` Subcommand

Discover a process model from an event log

- ` `: Path to the event log file (.xes or .json)

- `-a --algo`: Algorithm to use (heuristic, inductive)

- `-a --activity-key`: Activity key to use (e.g. "concept:name")

#### `conformance` Subcommand

Check conformance of an event log against a model

- ` `: Path to the event log file

- ` `: Path to the model file (.dfg or .pnml)

- `-a --activity-key`: Activity key to use

### `config`

Manage CLI configuration

#### `get` Subcommand

Get a configuration value

- ` `: The key to retrieve

#### `set` Subcommand

Set a configuration value

- ` `: The key to set

- ` `: The value to set

### `autoprocess`

Run AutoProcess: Perception → Decision → Protection → Optimization

#### Arguments

- ` `: Path to XES event log file

- `-a --activity-key`: Attribute key for activity names

- ` --config`: AutoProcess configuration as a JSON object

- `-f --format`: Output format (human, json)

### `agent`

Manage autonomous RL agents

#### `list` Subcommand

List all available RL agents

#### `status` Subcommand

Show the status and telemetry of the active agent

#### `switch` Subcommand

Switch the active RL agent

- ` `: Agent index (0: QLearning, 1: SARSA, 2: DoubleQLearning, 3: ExpectedSARSA, 4: REINFORCE)

#### `reset` Subcommand

Reset the RL orchestrator and all agents

### `spc`

Statistical Process Control (SPC) status and history

#### `status` Subcommand

Show current SPC status and rule violations

#### `history` Subcommand

View the ring buffer history of process metrics

- `-l --limit`: Number of historical cycles to show

### `audit`

Run a Vision 2030 conformance audit on an event log

#### Arguments

- ` `: Path to XES event log file

- `-a --activity-key`: Attribute key for activity names

### `man`

Generate markdown documentation for the CLI

