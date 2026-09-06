import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

export interface AuthorConfig {
  promptFile: string;
  outDir: string;
  execute: boolean;
}

export interface AuthorResult {
  status: "success" | "failed";
  path: string;
  error?: string;
  usage?: unknown;
}

const MAX_PROMPT_BYTES = 400 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 180 * 1000;
const AUTH_TIMEOUT_MS = 10 * 1000;

const ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "CODEX_HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
] as const;

const DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "apps",
  "plugins",
  "hooks",
  "multi_agent",
  "browser_use",
  "computer_use",
  "image_generation",
  "in_app_browser",
  "view_image",
  "memories",
] as const;

export function parseArgs(argv: string[]): AuthorConfig {
  let promptFile: string | undefined;
  let outDir: string | undefined;
  let execute = false;

  for (const arg of argv) {
    if (arg.startsWith("--prompt=")) {
      promptFile = arg.slice("--prompt=".length);
    } else if (arg.startsWith("--out-dir=")) {
      outDir = arg.slice("--out-dir=".length);
    } else if (arg === "--execute") {
      execute = true;
    } else { throw new Error("Unknown author argument"); }
  }

  if (!promptFile || !outDir) {
    throw new Error("Missing required arguments: --prompt and --out-dir");
  }

  return { promptFile, outDir, execute };
}

export function filterEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ENV_ALLOWLIST) {
    if (env[key] !== undefined) {
      result[key] = env[key];
    }
  }
  return result;
}

export async function validatePrompt(promptFile: string): Promise<string> {
  const stat = await fs.stat(promptFile);
  if (!stat.isFile() || stat.size > MAX_PROMPT_BYTES) {
    throw new Error("Prompt file exceeds 400KB limit");
  }
  const content = await fs.readFile(promptFile, "utf8");
  if (Buffer.byteLength(content) > MAX_PROMPT_BYTES) throw new Error("Prompt exceeds 400KB limit");
  if (content.trim().length === 0) {
    throw new Error("Prompt file is blank");
  }
  return content;
}

export async function checkAuth(): Promise<void> {
  try {
    const { stdout, stderr } = await promisify(execFile)("codex", ["login", "status"], {
      env: filterEnv(process.env), timeout: AUTH_TIMEOUT_MS, encoding: "utf8",
    });
    if (!(stdout + stderr).includes("Logged in using ChatGPT")) throw new Error("not ChatGPT");
  } catch {
    throw new Error("Authentication check failed: ChatGPT login required");
  }
}

export function buildCodexArgs(promptContent: string): string[] {
  const args = [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--json",
    "--color",
    "never",
    "-m",
    "gpt-6-astra",
    "-c",
    'model_provider="openai"',
    "-c",
    'forced_login_method="chatgpt"',
    "-c",
    'model_reasoning_effort="low"',
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    'web_search="disabled"',
    "-c",
    'approval_policy="never"',
  ];

  for (const feature of DISABLED_FEATURES) {
    args.push("--disable", feature);
  }

  return args;
}

export interface ParserResult {
  success: boolean;
  agentMessage: string;
  usage?: unknown;
  error?: string;
}

export function parseJsonlOutput(stdout: string): ParserResult {
  const fail = (error: string): ParserResult => ({ success: false, agentMessage: "", error });
  const lines = stdout.split("\n").filter(l => l.trim());
  if (!lines.length) return fail("No JSONL output");
  let completed = false, agentMessage = "";
  let usage: unknown;
  for (const line of lines) {
    let record: any;
    try { record = JSON.parse(line); } catch { return fail("Invalid JSONL line"); }
    if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.type !== "string") return fail("Invalid JSONL event");
    if (record.type === "error" || record.type === "turn.failed") return fail("Turn failed or error encountered");
    if (record.type.startsWith("item.")) {
      const item = record.item;
      if (!item || !["agent_message", "reasoning"].includes(item.type)) return fail("Disallowed tool item encountered");
      if (completed) return fail("Item after turn completion");
      if (record.type === "item.completed" && item.type === "agent_message" && typeof item.text === "string") agentMessage = item.text;
    }
    if (record.type === "turn.completed") {
      if (completed) return fail("Multiple completed turns");
      completed = true; usage = record.usage;
    }
  }
  if (!completed) return fail("Missing turn.completed");
  if (!agentMessage.trim()) return fail("Empty agent_message");
  return { success: true, agentMessage, usage };
}

export type CodexOutput = { stdout: string; stderr: string; exitCode: number; error?: string };
export async function runCodex(
  promptContent: string, outDir: string, env: NodeJS.ProcessEnv,
  options: { timeoutMs?: number; spawnProcess?: typeof spawn; signal?: AbortSignal } = {}
): Promise<CodexOutput> {
  return new Promise(resolve => {
    if (options.signal?.aborted) {
      resolve({ stdout: "", stderr: "", exitCode: 1, error: "Codex cancelled" });
      return;
    }
    const grouped = process.platform !== "win32";
    const child = (options.spawnProcess ?? spawn)("codex", buildCodexArgs(promptContent), {
      cwd: outDir, env, shell: false, detached: grouped, stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let bytes = 0, failure: string | undefined, settled = false;
    let hardKill: NodeJS.Timeout | undefined;
    const signal = (sig: NodeJS.Signals) => {
      try {
        if (grouped && child.pid) process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch { /* Process may already have exited. */ }
    };
    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true; clearTimeout(timer); if (hardKill) clearTimeout(hardKill);
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
      resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), exitCode, ...(failure ? { error: failure } : {}) });
    };
    const stop = (reason: string) => {
      if (failure || settled) return;
      failure = reason;
      hardKill = setTimeout(() => {
        signal("SIGKILL");
        child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy(); child.unref();
        finish(1);
      }, 1000);
      signal("SIGTERM");
    };
    const timer = setTimeout(() => stop("Process timeout exceeded"), options.timeoutMs ?? PROCESS_TIMEOUT_MS);
    const onAbort = () => stop("Codex cancelled");
    if (options.signal) options.signal.addEventListener("abort", onAbort);
    if (options.signal?.aborted) stop("Codex cancelled");
    const capture = (destination: Buffer[], chunk: Buffer | string) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, MAX_OUTPUT_BYTES - bytes);
      if (remaining) destination.push(data.subarray(0, remaining));
      bytes += data.length;
      if (bytes > MAX_OUTPUT_BYTES) stop("Combined output size limit exceeded");
    };
    child.stdout?.on("data", chunk => capture(stdout, chunk));
    child.stderr?.on("data", chunk => capture(stderr, chunk));
    child.on("error", () => { failure = "Codex process unavailable"; finish(1); });
    child.on("close", code => finish(failure ? 1 : code ?? 1));
    child.stdin?.on("error", () => stop("Codex stdin failed"));
    child.stdin?.end(promptContent);
  });
}

export async function main(
  argv: string[],
  deps: { auth?: () => Promise<void>; run?: typeof runCodex } = {}
): Promise<AuthorResult> {
  const config = parseArgs(argv);
  const promptContent = await validatePrompt(config.promptFile);
  try {
    await fs.lstat(config.outDir);
    throw new Error("Output directory already exists");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (!config.execute) {
    console.log(JSON.stringify({ dryRun: true, model: "gpt-6-astra", reasoning: "low", inputBytes: Buffer.byteLength(promptContent) }));
    return { status: "success", path: config.outDir };
  }
  await (deps.auth ?? checkAuth)();
  await fs.mkdir(config.outDir, { mode: 0o700 });
  const save = (name: string, value: string) => fs.writeFile(path.join(config.outDir, name), value, { mode: 0o600, flag: "wx" });
  await save("prompt.private.md", promptContent);
  let result: AuthorResult;
  const started = Date.now();
  try {
    const output = await (deps.run ?? runCodex)(promptContent, path.resolve(config.outDir), filterEnv(process.env));
    await save("events.private.jsonl", output.stdout);
    await save("stderr.private.txt", output.stderr);
    const parsed = parseJsonlOutput(output.stdout);
    if (output.error || output.exitCode !== 0 || !parsed.success) {
      result = { status: "failed", path: config.outDir, error: output.error ?? (output.exitCode !== 0 ? "Codex process failed; inspect saved evidence" : parsed.error) };
    } else {
      await save("narration.md", parsed.agentMessage);
      result = { status: "success", path: config.outDir, usage: parsed.usage };
    }
  } catch {
    result = { status: "failed", path: config.outDir, error: "Author execution or evidence write failed" };
  }
  await save("result.private.json", JSON.stringify({
    ...result, elapsedMs: Date.now() - started, requested_model: "gpt-6-astra", requested_effort: "low",
    transport: "codex_cli", billing: "ChatGPT quota", audit: "not_run", openrouterRequests: 0,
  }, null, 2));
  return result;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((result) => {
      console.log(`${result.status} ${result.path}`);
      if (result.status === "failed") {
        process.exitCode = 1;
      }
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`failed ${msg}`);
      process.exitCode = 1;
    });
}
