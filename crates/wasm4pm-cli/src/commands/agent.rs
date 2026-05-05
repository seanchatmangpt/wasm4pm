use anyhow::Result;
use clap::{Args, Subcommand};
use colored::*;
use wasm4pm_cli::io::{Io, Table};
use wasm4pm::rl_orchestrator::AgentType;
use wasm4pm::RL_ORCHESTRATOR;

#[derive(Args, Debug)]
pub struct AgentArgs {
    #[command(subcommand)]
    pub command: AgentCommands,
}

#[derive(Subcommand, Debug)]
pub enum AgentCommands {
    /// List all available RL agents.
    List,
    /// Show the status and telemetry of the active agent.
    Status,
    /// Switch the active RL agent.
    Switch {
        /// Agent index (0: QLearning, 1: SARSA, 2: DoubleQLearning, 3: ExpectedSARSA, 4: REINFORCE)
        index: u8,
    },
    /// Reset the RL orchestrator and all agents.
    Reset,
}

pub fn run(args: &AgentArgs) -> Result<()> {
    let io = Io::new(false);
    match &args.command {
        AgentCommands::List => {
            list_agents(&io);
            Ok(())
        }
        AgentCommands::Status => show_status(&io),
        AgentCommands::Switch { index } => switch_agent(*index, &io),
        AgentCommands::Reset => reset_agents(&io),
    }
}

fn list_agents(io: &Io) {
    let mut table = Table::new(vec!["Index", "Name", "Description"]);
    table.add_row(vec![
        "0".to_string(),
        "QLearning".to_string(),
        "Standard off-policy temporal difference learning".to_string(),
    ]);
    table.add_row(vec![
        "1".to_string(),
        "SARSA".to_string(),
        "On-policy temporal difference learning".to_string(),
    ]);
    table.add_row(vec![
        "2".to_string(),
        "DoubleQLearning".to_string(),
        "Reduces overestimation bias in Q-values".to_string(),
    ]);
    table.add_row(vec![
        "3".to_string(),
        "ExpectedSARSA".to_string(),
        "Smoother updates than SARSA using expectation".to_string(),
    ]);
    table.add_row(vec![
        "4".to_string(),
        "REINFORCE".to_string(),
        "Monte Carlo policy gradient agent".to_string(),
    ]);

    io.header("Available RL Agents");
    table.print();
}

fn show_status(io: &Io) -> Result<()> {
    RL_ORCHESTRATOR.with(|orch_cell| {
        let orch = orch_cell.borrow();
        let telemetry = orch.telemetry();

        io.header("Active Agent Status");
        println!(
            "{:<25} {}",
            "Active Agent:".bold(),
            telemetry.active_agent_name.green()
        );
        println!("{:<25} {}", "Cycle Count:".bold(), telemetry.cycle_count);
        println!(
            "{:<25} {:.4}",
            "Cumulative Reward:".bold(),
            telemetry.cumulative_reward
        );
        println!("{:<25} {:.4}", "Last Reward:".bold(), telemetry.last_reward);
        println!(
            "{:<25} {}",
            "Consecutive Successes:".bold(),
            telemetry.consecutive_successes
        );

        println!(
            "\n{:<25} {}",
            "Last Action:".bold(),
            telemetry.last_action_label.yellow()
        );
        println!(
            "{:<25} {}",
            "Last Guard Pass:".bold(),
            if telemetry.last_guard_pass {
                "YES".green()
            } else {
                "NO".red()
            }
        );
        println!(
            "{:<25} {}",
            "Last Circuit Allowed:".bold(),
            if telemetry.last_circuit_allowed {
                "YES".green()
            } else {
                "NO".red()
            }
        );
        println!(
            "{:<25} {}",
            "Last SPC Alerts:".bold(),
            telemetry.last_spc_alert_count
        );

        Ok(())
    })
}

fn switch_agent(index: u8, io: &Io) -> Result<()> {
    RL_ORCHESTRATOR.with(|orch_cell| {
        let mut orch = orch_cell.borrow_mut();
        match AgentType::from_u8(index) {
            Some(at) => {
                orch.switch_agent(at);
                io.success(format!("Switched to active agent: {}", at.name()));
                Ok(())
            }
            None => {
                anyhow::bail!(
                    "Invalid agent index: {}. Use 'wpm agent list' to see available agents.",
                    index
                );
            }
        }
    })
}

fn reset_agents(io: &Io) -> Result<()> {
    RL_ORCHESTRATOR.with(|orch_cell| {
        let mut orch = orch_cell.borrow_mut();
        *orch = wasm4pm::rl_orchestrator::RlOrchestrator::new();
        io.success("RL orchestrator and all agents have been reset to initial state.");
        Ok(())
    })
}
