#!/usr/bin/env bun
import { parseArgs } from "node:util";
import path from "node:path";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import chalk from "chalk";
import { checkbox, confirm } from "@inquirer/prompts";
import { PACKAGE_NAME, VERSION } from "../src/version.ts";

export interface TargetPlatform {
  id: string;
  bunTarget: string;
  os: "darwin" | "linux" | "windows";
  arch: "arm64" | "x64";
  name: string;
  icon: string;
  ext: string;
  description: string;
}

export const TARGET_PLATFORMS: TargetPlatform[] = [
  {
    id: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    os: "darwin",
    arch: "arm64",
    name: "macOS (Apple Silicon)",
    icon: "🍏",
    ext: "",
    description: "Apple M1 / M2 / M3 / M4 processors",
  },
  {
    id: "darwin-x64",
    bunTarget: "bun-darwin-x64",
    os: "darwin",
    arch: "x64",
    name: "macOS (Intel)",
    icon: "🍏",
    ext: "",
    description: "Intel 64-bit Macs",
  },
  {
    id: "linux-x64",
    bunTarget: "bun-linux-x64",
    os: "linux",
    arch: "x64",
    name: "Linux (x64)",
    icon: "🐧",
    ext: "",
    description: "Standard 64-bit Linux (glibc)",
  },
  {
    id: "linux-arm64",
    bunTarget: "bun-linux-arm64",
    os: "linux",
    arch: "arm64",
    name: "Linux (ARM64)",
    icon: "🐧",
    ext: "",
    description: "64-bit ARM Linux (Raspberry Pi 4/5, AWS Graviton)",
  },
  {
    id: "windows-x64",
    bunTarget: "bun-windows-x64",
    os: "windows",
    arch: "x64",
    name: "Windows (x64)",
    icon: "🪟",
    ext: ".exe",
    description: "64-bit Windows executable",
  },
];

export interface BuildOptions {
  targets: TargetPlatform[];
  buildJsBundle: boolean;
  outDir: string;
  entryPoint: string;
  clean: boolean;
  minify: boolean;
  generateChecksums: boolean;
}

export interface BuildResultItem {
  targetId: string;
  name: string;
  icon: string;
  outputPath: string;
  sizeBytes: number;
  durationMs: number;
  sha256: string;
  success: boolean;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function banner(): void {
  console.log("");
  console.log(
    chalk.bold.hex("#6366f1")("⚡ dethz-crawler Cross-Platform Build Tool") +
      chalk.gray(` v${VERSION}`)
  );
  console.log(
    chalk.dim("   Compile standalone executables for multi-OS targets using Bun")
  );
  console.log(chalk.gray("─".repeat(60)));
}

function printHelp(): void {
  banner();
  console.log(`
${chalk.bold("USAGE:")}
  ${chalk.cyan("bun run scripts/build.ts")} [options]
  ${chalk.cyan("bun run build:bin")} [options]

${chalk.bold("OPTIONS:")}
  ${chalk.yellow("-a, --all")}               Build for all supported platforms
  ${chalk.yellow("-t, --target")} <targets>  Specific target IDs (comma-separated)
                             Supported: ${TARGET_PLATFORMS.map((t) => chalk.cyan(t.id)).join(", ")}
  ${chalk.yellow("--os")} <os-list>          Target operating system(s): ${chalk.cyan("mac")}, ${chalk.cyan("linux")}, ${chalk.cyan("windows")}
  ${chalk.yellow("--js")}                    Also build universal JavaScript bundle (dist/index.js)
  ${chalk.yellow("-o, --outdir")} <dir>      Output directory ${chalk.dim("(default: build)")}
  ${chalk.yellow("--entry")} <file>          Custom entrypoint ${chalk.dim("(default: src/index.ts)")}
  ${chalk.yellow("--clean")}                 Remove output directory before building
  ${chalk.yellow("--no-checksums")}          Skip generating SHA-256 checksums file
  ${chalk.yellow("-h, --help")}              Show this help message

${chalk.bold("EXAMPLES:")}
  ${chalk.dim("# Interactive selection menu")}
  bun run scripts/build.ts

  ${chalk.dim("# Build for all platforms at once")}
  bun run scripts/build.ts --all

  ${chalk.dim("# Build only for macOS (Apple Silicon & Intel)")}
  bun run scripts/build.ts --os mac

  ${chalk.dim("# Build for Linux x64 and Windows x64")}
  bun run scripts/build.ts -t linux-x64,windows-x64
`);
}

export async function computeSha256(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(new Uint8Array(buffer));
  return hasher.digest("hex");
}

export async function buildJsBundle(
  entryPoint: string,
  outDir: string
): Promise<BuildResultItem> {
  const start = performance.now();
  const outFile = path.resolve(outDir, "index.js");

  const buildResult = await Bun.build({
    entrypoints: [entryPoint],
    outdir: outDir,
    target: "bun",
    minify: false,
  });

  if (!buildResult.success) {
    const errorMsg = buildResult.logs.map((l) => l.message).join("\n");
    return {
      targetId: "js-bundle",
      name: "JavaScript Bundle",
      icon: "📦",
      outputPath: outFile,
      sizeBytes: 0,
      durationMs: Math.round(performance.now() - start),
      sha256: "",
      success: false,
      error: errorMsg,
    };
  }

  // Make executable on Unix
  try {
    const chmodProc = Bun.spawnSync(["chmod", "+x", outFile]);
    if (chmodProc.exitCode !== 0) {
      // Non-fatal if chmod fails on Windows
    }
  } catch {}

  const stats = statSync(outFile);
  const sha256 = await computeSha256(outFile);

  return {
    targetId: "js-bundle",
    name: "JavaScript Bundle (dist/index.js)",
    icon: "📦",
    outputPath: outFile,
    sizeBytes: stats.size,
    durationMs: Math.round(performance.now() - start),
    sha256,
    success: true,
  };
}

export async function compileBinary(
  target: TargetPlatform,
  entryPoint: string,
  outDir: string
): Promise<BuildResultItem> {
  const start = performance.now();
  const baseName = `${PACKAGE_NAME}-${target.id}${target.ext}`;
  const outFile = path.resolve(outDir, baseName);

  const cmd = [
    "bun",
    "build",
    "--compile",
    `--target=${target.bunTarget}`,
    `--outfile=${outFile}`,
    entryPoint,
  ];

  const proc = Bun.spawnSync(cmd, {
    stderr: "pipe",
    stdout: "pipe",
  });

  const durationMs = Math.round(performance.now() - start);

  if (proc.exitCode !== 0) {
    const errorText = proc.stderr.toString().trim() || proc.stdout.toString().trim();
    return {
      targetId: target.id,
      name: target.name,
      icon: target.icon,
      outputPath: outFile,
      sizeBytes: 0,
      durationMs,
      sha256: "",
      success: false,
      error: errorText,
    };
  }

  if (target.os !== "windows") {
    try {
      Bun.spawnSync(["chmod", "+x", outFile]);
    } catch {}
  }

  const stats = statSync(outFile);
  const sha256 = await computeSha256(outFile);

  return {
    targetId: target.id,
    name: target.name,
    icon: target.icon,
    outputPath: outFile,
    sizeBytes: stats.size,
    durationMs,
    sha256,
    success: true,
  };
}

export async function executeBuilds(options: BuildOptions): Promise<BuildResultItem[]> {
  const { targets, buildJsBundle: shouldBuildJs, outDir, entryPoint, clean, generateChecksums } =
    options;

  if (clean && existsSync(outDir)) {
    console.log(chalk.yellow(`🧹 Cleaning output directory: ${outDir}`));
    rmSync(outDir, { recursive: true, force: true });
  }

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const results: BuildResultItem[] = [];

  // 1. Build standard JS bundle if requested
  if (shouldBuildJs) {
    process.stdout.write(`   📦 Building JavaScript bundle... `);
    const jsResult = await buildJsBundle(entryPoint, outDir);
    if (jsResult.success) {
      console.log(
        chalk.green("✔ Done") +
          chalk.dim(` (${formatBytes(jsResult.sizeBytes)} in ${jsResult.durationMs}ms)`)
      );
    } else {
      console.log(chalk.red("✖ Failed: ") + jsResult.error);
    }
    results.push(jsResult);
  }

  // 2. Compile standalone binaries
  for (const [i, target] of targets.entries()) {
    const indexStr = `[${i + 1}/${targets.length}]`;
    process.stdout.write(
      `   ${indexStr} ${target.icon} Compiling for ${chalk.bold(target.name)} (${chalk.cyan(
        target.id
      )})... `
    );

    const result = await compileBinary(target, entryPoint, outDir);

    if (result.success) {
      console.log(
        chalk.green("✔ Done") +
          chalk.dim(` (${formatBytes(result.sizeBytes)} in ${result.durationMs}ms)`)
      );
    } else {
      console.log(chalk.red("✖ Failed"));
      if (result.error) {
        console.log(chalk.red(`       Error: ${result.error}`));
      }
    }

    results.push(result);
  }

  // 3. Write SHA-256 checksums file
  if (generateChecksums && results.filter((r) => r.success).length > 0) {
    const checksumLines = results
      .filter((r) => r.success)
      .map((r) => `${r.sha256}  ${path.basename(r.outputPath)}`);

    const checksumPath = path.resolve(outDir, "SHA256SUMS.txt");
    await Bun.write(checksumPath, checksumLines.join("\n") + "\n");
    console.log(
      chalk.dim(`\n   📄 Generated checksums: ${path.relative(process.cwd(), checksumPath)}`)
    );
  }

  return results;
}

export function displaySummary(results: BuildResultItem[]): void {
  console.log("\n" + chalk.gray("─".repeat(60)));
  console.log(chalk.bold("BUILD SUMMARY:"));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  for (const item of results) {
    const status = item.success ? chalk.green("✔ SUCCESS") : chalk.red("✖ FAILED");
    const filename = path.basename(item.outputPath);
    const size = item.success ? chalk.cyan(formatBytes(item.sizeBytes)) : chalk.dim("0 B");
    const time = chalk.dim(`${item.durationMs}ms`);

    console.log(
      `  ${item.icon} ${chalk.bold(item.name.padEnd(28))} ${status}  ${size.padEnd(10)} ${time}`
    );
    if (item.success) {
      console.log(`     ${chalk.dim(`→ ${item.outputPath}`)}`);
      console.log(`     ${chalk.dim(`SHA256: ${item.sha256}`)}`);
    } else if (item.error) {
      console.log(`     ${chalk.red(`Error: ${item.error}`)}`);
    }
  }

  console.log(chalk.gray("─".repeat(60)));
  console.log(
    `Total: ${chalk.bold(results.length)} target(s) | ` +
      `${chalk.green(`${successful.length} succeeded`)} | ` +
      `${failed.length > 0 ? chalk.red(`${failed.length} failed`) : chalk.gray("0 failed")}`
  );
}

export function parseTargetArguments(
  targetArg?: string,
  osArg?: string,
  allFlag?: boolean
): TargetPlatform[] {
  if (allFlag) {
    return [...TARGET_PLATFORMS];
  }

  const selectedTargets = new Map<string, TargetPlatform>();

  if (targetArg) {
    const requested = targetArg
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    for (const req of requested) {
      const match = TARGET_PLATFORMS.find(
        (p) => p.id.toLowerCase() === req || p.bunTarget.toLowerCase() === req
      );
      if (match) {
        selectedTargets.set(match.id, match);
      } else {
        console.warn(
          chalk.yellow(`⚠ Warning: Unknown target "${req}". Run with --help to see supported targets.`)
        );
      }
    }
  }

  if (osArg) {
    const requestedOs = osArg
      .split(",")
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean);

    for (const osName of requestedOs) {
      if (osName === "mac" || osName === "darwin" || osName === "macos") {
        TARGET_PLATFORMS.filter((p) => p.os === "darwin").forEach((p) =>
          selectedTargets.set(p.id, p)
        );
      } else if (osName === "linux") {
        TARGET_PLATFORMS.filter((p) => p.os === "linux").forEach((p) =>
          selectedTargets.set(p.id, p)
        );
      } else if (osName === "windows" || osName === "win") {
        TARGET_PLATFORMS.filter((p) => p.os === "windows").forEach((p) =>
          selectedTargets.set(p.id, p)
        );
      } else {
        console.warn(
          chalk.yellow(`⚠ Warning: Unknown OS filter "${osName}". Supported: mac, linux, windows.`)
        );
      }
    }
  }

  return Array.from(selectedTargets.values());
}

async function promptTargetSelection(): Promise<{
  targets: TargetPlatform[];
  buildJs: boolean;
}> {
  type ChoiceValue = string;

  const choices = [
    {
      name: `${chalk.bold.yellow("★ ALL PLATFORMS")} - Compile for all 5 operating systems & architectures`,
      value: "ALL",
    },
    ...TARGET_PLATFORMS.map((target) => ({
      name: `${target.icon} ${chalk.bold(target.name)} ${chalk.dim(`(${target.id})`)} - ${chalk.gray(
        target.description
      )}`,
      value: target.id,
    })),
    {
      name: `📦 ${chalk.bold("JavaScript Bundle")} ${chalk.dim("(dist/index.js)")} - For npm / bunx execution`,
      value: "JS_BUNDLE",
    },
  ];

  const selection = await checkbox<ChoiceValue>({
    message: "Select which OS/platform binaries to compile:",
    choices,
    validate: (ans) => (ans.length > 0 ? true : "Please select at least one option."),
  });

  const buildAll = selection.includes("ALL");
  const buildJs = selection.includes("JS_BUNDLE");

  let targets: TargetPlatform[] = [];
  if (buildAll) {
    targets = [...TARGET_PLATFORMS];
  } else {
    targets = TARGET_PLATFORMS.filter((p) => selection.includes(p.id));
  }

  return { targets, buildJs };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      all: { type: "boolean", short: "a", default: false },
      target: { type: "string", short: "t" },
      os: { type: "string" },
      js: { type: "boolean", default: false },
      outdir: { type: "string", short: "o", default: "build" },
      entry: { type: "string", default: "src/index.ts" },
      clean: { type: "boolean", default: false },
      checksums: { type: "boolean", default: true },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    return;
  }

  banner();

  const outDir = path.resolve(process.cwd(), values.outdir || "build");
  const entryPoint = path.resolve(process.cwd(), values.entry || "src/index.ts");

  if (!existsSync(entryPoint)) {
    console.error(chalk.red(`✖ Entrypoint not found: ${entryPoint}`));
    process.exit(1);
  }

  let selectedTargets: TargetPlatform[] = parseTargetArguments(
    values.target,
    values.os,
    values.all
  );
  let buildJs = Boolean(values.js);

  // If no targets were passed via CLI flags and we are in an interactive terminal, prompt the user
  if (selectedTargets.length === 0 && !buildJs) {
    if (process.stdin.isTTY) {
      try {
        const prompted = await promptTargetSelection();
        selectedTargets = prompted.targets;
        buildJs = prompted.buildJs;
      } catch {
        console.log(chalk.gray("\nBuild cancelled."));
        process.exit(0);
      }
    } else {
      console.error(
        chalk.red(
          "✖ No targets specified. Use --all, --target <targets>, --os <os>, or run interactively."
        )
      );
      process.exit(1);
    }
  }

  if (selectedTargets.length === 0 && !buildJs) {
    console.log(chalk.yellow("No platforms selected to build. Exiting."));
    return;
  }

  console.log(chalk.bold("Configuration:"));
  console.log(`  • Entrypoint: ${chalk.cyan(path.relative(process.cwd(), entryPoint))}`);
  console.log(`  • Output Dir: ${chalk.cyan(path.relative(process.cwd(), outDir) || ".")}`);
  console.log(
    `  • Targets (${selectedTargets.length + (buildJs ? 1 : 0)}): ${[
      ...selectedTargets.map((t) => `${t.icon} ${t.id}`),
      ...(buildJs ? ["📦 js-bundle"] : []),
    ].join(", ")}`
  );
  console.log("");

  const results = await executeBuilds({
    targets: selectedTargets,
    buildJsBundle: buildJs,
    outDir,
    entryPoint,
    clean: Boolean(values.clean),
    minify: true,
    generateChecksums: Boolean(values.checksums),
  });

  displaySummary(results);

  const hasFailures = results.some((r) => !r.success);
  if (hasFailures) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(chalk.red(`Fatal build error: ${err.message}`));
    process.exit(1);
  });
}
