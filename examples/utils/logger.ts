/**
 * wasm4pm Example Logger Utility
 * 
 * Provides a standardized, colorful, and highly readable CLI output
 * format to 1000x the Developer Experience (DX) of running examples.
 */

export const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  fg: {
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
  }
};

export const logger = {
  /** Prints a massive, colored header for a case study or example */
  header: (icon: string, title: string, subtitle?: string) => {
    console.log(`\n${colors.bright}${colors.fg.magenta}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓${colors.reset}`);
    console.log(`${colors.bright}${colors.fg.magenta}┃ ${icon}  ${title.padEnd(55)}┃${colors.reset}`);
    if (subtitle) {
      console.log(`${colors.bright}${colors.fg.magenta}┃    ${colors.dim}${subtitle.padEnd(54)}${colors.reset}${colors.bright}${colors.fg.magenta}┃${colors.reset}`);
    }
    console.log(`${colors.bright}${colors.fg.magenta}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${colors.reset}\n`);
  },

  /** Clearly demarcates a step in the process */
  step: (step: number, total: number, msg: string) => {
    console.log(`\n${colors.bright}${colors.fg.cyan}[Step ${step}/${total}]${colors.reset} ${colors.bright}${msg}${colors.reset}`);
  },

  success: (msg: string) => console.log(`  ${colors.fg.green}✔ SUCCESS:${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`  ${colors.fg.blue}ℹ INFO:${colors.reset}    ${msg}`),
  warn: (msg: string) => console.log(`  ${colors.fg.yellow}⚠ WARN:${colors.reset}    ${msg}`),
  error: (msg: string) => console.log(`  ${colors.fg.red}✖ ERROR:${colors.reset}   ${msg}`),
  
  /** Inspects and prints data structures with formatting */
  data: (label: string, data: any, truncateLines: number = 10) => {
    console.log(`  ${colors.dim}┌─ Data: ${label} ${'─'.repeat(40 - label.length)}${colors.reset}`);
    
    let strData = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const lines = strData.split('\n');
    
    const displayLines = lines.slice(0, truncateLines);
    for (const line of displayLines) {
      console.log(`  ${colors.dim}│${colors.reset}  ${colors.fg.blue}${line}${colors.reset}`);
    }
    
    if (lines.length > truncateLines) {
      console.log(`  ${colors.dim}│${colors.reset}  ${colors.dim}... (${lines.length - truncateLines} more lines truncated) ...${colors.reset}`);
    }
    console.log(`  ${colors.dim}└─────────────────────────────────────────────────────${colors.reset}`);
  }
};
