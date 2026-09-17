export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background
  bgCyan: "\x1b[46m",
  bgBlack: "\x1b[40m",
  bgBlue: "\x1b[44m",
};

export const c = {
  bold: (s: string) => `${colors.bold}${s}${colors.reset}`,
  dim: (s: string) => `${colors.dim}${s}${colors.reset}`,
  cyan: (s: string) => `${colors.cyan}${s}${colors.reset}`,
  green: (s: string) => `${colors.green}${s}${colors.reset}`,
  yellow: (s: string) => `${colors.yellow}${s}${colors.reset}`,
  red: (s: string) => `${colors.red}${s}${colors.reset}`,
  magenta: (s: string) => `${colors.magenta}${s}${colors.reset}`,
  blue: (s: string) => `${colors.blue}${s}${colors.reset}`,
  gray: (s: string) => `${colors.gray}${s}${colors.reset}`,
  underline: (s: string) => `${colors.underline}${s}${colors.reset}`,
  badge: (label: string, text: string) =>
    `${colors.bgCyan}${colors.black}${colors.bold} ${label} ${colors.reset} ${text}`,
};

export function banner(): void {
  console.log("");
  console.log(
    c.bold(
      c.cyan("⚡ crawler") +
        c.gray(" v0.1.0") +
        c.dim(" - AI Agent Skills & Rules Sync")
    )
  );
  console.log(
    c.gray("   Pull SKILL.md & rules from GitHub into your local project")
  );
  console.log("");
}

export function info(msg: string): void {
  console.log(`${c.cyan("ℹ")} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${c.green("✔")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${c.yellow("⚠")} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${c.red("✖")} ${msg}`);
}

export function step(stepNum: number, total: number, msg: string): void {
  console.log(`${c.dim(`[${stepNum}/${total}]`)} ${c.bold(msg)}`);
}

export function divider(): void {
  console.log(c.gray("─".repeat(50)));
}
