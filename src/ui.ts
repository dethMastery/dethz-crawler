import chalk from "chalk";

export const c = chalk;

export function banner(): void {
  console.log("");
  console.log(
    chalk.bold(
      chalk.cyan("⚡ dethz-crawler") +
        chalk.gray(" v0.2.0") +
        chalk.dim(" - AI Agent Skills & Rules Sync"),
    ),
  );
  console.log(
    chalk.gray("   Pull SKILL.md & rules from GitHub into your local project"),
  );
  console.log("");
}

export function info(msg: string): void {
  console.log(`${chalk.cyan("ℹ")} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${chalk.green("✔")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${chalk.yellow("⚠")} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${chalk.red("✖")} ${msg}`);
}

export function step(stepNum: number, total: number, msg: string): void {
  console.log(`${chalk.dim(`[${stepNum}/${total}]`)} ${chalk.bold(msg)}`);
}

export function divider(): void {
  console.log(chalk.gray("─".repeat(50)));
}
