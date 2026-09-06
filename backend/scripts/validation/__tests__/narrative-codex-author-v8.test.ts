import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseArgs,
  filterEnv,
  validatePrompt,
  runCodex,
  buildCodexArgs,
  parseJsonlOutput,
  main,
} from "../narrative-codex-author-v8";

describe("narrative-codex-author-v8", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "narrative-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("parseArgs", () => {
    it("parses prompt and out-dir", () => {
      const config = parseArgs(["--prompt=/tmp/p.txt", "--out-dir=/tmp/out"]);
      expect(config.promptFile).toBe("/tmp/p.txt");
      expect(config.outDir).toBe("/tmp/out");
      expect(config.execute).toBe(false);
    });

    it("parses execute flag", () => {
      const config = parseArgs(["--prompt=/tmp/p.txt", "--out-dir=/tmp/out", "--execute"]);
      expect(config.execute).toBe(true);
    });

    it("throws on missing args", () => {
      expect(() => parseArgs(["--prompt=/tmp/p.txt"])).toThrow();
    });
  });

  describe("filterEnv", () => {
    it("only includes allowlisted keys", () => {
      const env = {
        PATH: "/usr/bin",
        HOME: "/home/user",
        CODEX_HOME: "/home/user/.codex",
        USER: "user",
        LOGNAME: "user",
        TMPDIR: "/tmp",
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        XDG_CONFIG_HOME: "/home/user/.config",
        XDG_DATA_HOME: "/home/user/.local/share",
        XDG_CACHE_HOME: "/home/user/.cache",
        SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
        SSL_CERT_DIR: "/etc/ssl/certs",
        SECRET_KEY: "should-not-appear",
        API_KEY: "should-not-appear",
      };
      const filtered = filterEnv(env);
      expect(filtered.PATH).toBe("/usr/bin");
      expect(filtered.HOME).toBe("/home/user");
      expect(filtered.CODEX_HOME).toBe("/home/user/.codex");
      expect(filtered.SECRET_KEY).toBeUndefined();
      expect(filtered.API_KEY).toBeUndefined();
    });
  });

  describe("validatePrompt", () => {
    it("reads valid prompt", async () => {
      const promptFile = path.join(tmpDir, "prompt.txt");
      await fs.writeFile(promptFile, "Hello world");
      const content = await validatePrompt(promptFile);
      expect(content).toBe("Hello world");
    });

    it("rejects blank prompt", async () => {
      const promptFile = path.join(tmpDir, "blank.txt");
      await fs.writeFile(promptFile, "   \n  ");
      await expect(validatePrompt(promptFile)).rejects.toThrow("blank");
    });

    it("rejects oversized prompt", async () => {
      const promptFile = path.join(tmpDir, "big.txt");
      const bigContent = "a".repeat(401 * 1024);
      await fs.writeFile(promptFile, bigContent);
      await expect(validatePrompt(promptFile)).rejects.toThrow("exceeds");
    });
  });


  describe("buildCodexArgs", () => {
    it("includes required flags and disables", () => {
      const args = buildCodexArgs("test prompt");
      expect(args).toContain("exec");
      expect(args).toContain("--ignore-user-config");
      expect(args).toContain("--ephemeral");
      expect(args).toContain("--skip-git-repo-check");
      expect(args).toContain("--sandbox");
      expect(args).toContain("read-only");
      expect(args).toContain("--json");
      expect(args).toContain("--color");
      expect(args).toContain("never");
      expect(args).toContain("-m");
      expect(args).toContain("gpt-6-astra");
      expect(args).toContain("-c");
      expect(args).toContain('model_provider="openai"');
      expect(args).toContain('forced_login_method="chatgpt"');
      expect(args).toContain('model_reasoning_effort="low"');
      expect(args).toContain("project_doc_max_bytes=0");
      expect(args).toContain('web_search="disabled"');
      expect(args).toContain('approval_policy="never"');
      expect(args).toContain("--disable");
      expect(args).toContain("shell_tool");
      expect(args).toContain("unified_exec");
      expect(args).toContain("apps");
      expect(args).toContain("plugins");
      expect(args).toContain("hooks");
      expect(args).toContain("multi_agent");
      expect(args).toContain("browser_use");
      expect(args).toContain("computer_use");
      expect(args).toContain("image_generation");
      expect(args).toContain("in_app_browser");
      expect(args).toContain("view_image");
      expect(args).toContain("memories");
    });
  });

  describe("parseJsonlOutput", () => {
    it("parses valid completion", () => {
      const stdout = [
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Final narration" } }),
        JSON.stringify({ type: "turn.completed", usage: { tokens: 100 } }),
      ].join("\n");
      const result = parseJsonlOutput(stdout);
      expect(result.success).toBe(true);
      expect(result.agentMessage).toBe("Final narration");
      expect(result.usage).toEqual({ tokens: 100 });
    });

    it("rejects error type", () => {
      const stdout = JSON.stringify({ type: "error", message: "something failed" });
      const result = parseJsonlOutput(stdout);
      expect(result.success).toBe(false);
      expect(result.error).toContain("error");
    });

    it("rejects turn.failed", () => {
      const stdout = JSON.stringify({ type: "turn.failed", reason: "timeout" });
      const result = parseJsonlOutput(stdout);
      expect(result.success).toBe(false);
      expect(result.error).toContain("failed");
    });

    it("rejects tool item", () => {
      const stdout = [
        JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "ls" } }),
        JSON.stringify({ type: "turn.completed", agent_message: "done" }),
      ].join("\n");
      const result = parseJsonlOutput(stdout);
      expect(result.success).toBe(false);
      expect(result.error).toContain("tool");
    });

    it("rejects missing completion", () => {
      const stdout = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "partial" } });
      const result = parseJsonlOutput(stdout);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing");
    });

    it("rejects empty agent_message", () => {
      const stdout = JSON.stringify({ type: "turn.completed", agent_message: "" });
      const result = parseJsonlOutput(stdout);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Empty");
    });

    it("rejects invalid JSONL", () => {
      const result = parseJsonlOutput("not json");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid");
    });

    it("rejects empty output", () => {
      const result = parseJsonlOutput("");
      expect(result.success).toBe(false);
      expect(result.error).toContain("No JSONL");
    });
  });

  describe("main dryrun", () => {
    it("does not spawn subprocess or write files", async () => {
      const promptFile = path.join(tmpDir, "prompt.txt");
      await fs.writeFile(promptFile, "Test prompt");
      const outDir = path.join(tmpDir, "out-dryrun");

      const auth = jest.fn(), run = jest.fn();
      const result = await main(["--prompt=" + promptFile, "--out-dir=" + outDir], { auth, run });
      expect(auth).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
      expect(result.status).toBe("success");
      expect(result.path).toBe(outDir);

      // Verify outdir was not created
      await expect(fs.access(outDir)).rejects.toThrow();
    });

    it("rejects existing outdir", async () => {
      const promptFile = path.join(tmpDir, "prompt.txt");
      await fs.writeFile(promptFile, "Test prompt");
      const outDir = path.join(tmpDir, "existing");
      await fs.mkdir(outDir);

      await expect(main(["--prompt=" + promptFile, "--out-dir=" + outDir])).rejects.toThrow("already exists");
    });
  });

  describe("main execute auth rejection", () => {
    it("rejects unknown args, malformed JSON and tools", () => {
      expect(() => parseArgs(["--prompt=a", "--out-dir=b", "--fallback"])).toThrow();
      expect(parseJsonlOutput("null").success).toBe(false);
      expect(parseJsonlOutput(JSON.stringify({ type: "item.completed", item: { type: "web_search" } })).success).toBe(false);
      expect(filterEnv({ OPENAI_API_KEY: "x", OPENROUTER_API_KEY: "y", HOME: "/home/a" })).toEqual({ HOME: "/home/a" });
    });

    it("writes a completed reply and quota metadata, not USD billing", async () => {
      const p = path.join(tmpDir, "prompt"); await fs.writeFile(p, "exact text");
      const out = path.join(tmpDir, "success");
      const run = jest.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: [
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Guion." } }),
        JSON.stringify({ type: "turn.completed", usage: { input_tokens: 4 } }),
      ].join("\n") });
      const result = await main(["--prompt=" + p, "--out-dir=" + out, "--execute"], { auth: async () => {}, run });
      expect(result.status).toBe("success");
      expect(await fs.readFile(path.join(out, "narration.md"), "utf8")).toBe("Guion.");
      expect(await fs.readFile(path.join(out, "prompt.private.md"), "utf8")).toBe("exact text");
      const metadata = JSON.parse(await fs.readFile(path.join(out, "result.private.json"), "utf8"));
      expect(metadata).toMatchObject({ requested_model: "gpt-6-astra", requested_effort: "low", openrouterRequests: 0, audit: "not_run" });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("keeps failed/partial evidence without publishing narration or retrying", async () => {
      const p = path.join(tmpDir, "prompt"); await fs.writeFile(p, "exact text");
      const out = path.join(tmpDir, "partial");
      const run = jest.fn().mockResolvedValue({ exitCode: 1, error: "Process timeout exceeded", stderr: "trace", stdout: "partial" });
      expect((await main(["--prompt=" + p, "--out-dir=" + out, "--execute"], { auth: async () => {}, run })).status).toBe("failed");
      expect(await fs.readFile(path.join(out, "events.private.jsonl"), "utf8")).toBe("partial");
      await expect(fs.access(path.join(out, "narration.md"))).rejects.toThrow();
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("bounds runtime and preserves UTF-8 through split buffers", async () => {
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
      child.stdin.end = jest.fn(); child.kill = jest.fn(() => { child.emit("close", null); return true; });
      child.unref = jest.fn();
      const spawnProcess: any = jest.fn(() => child);
      const pending = runCodex("prompt", tmpDir, {}, { timeoutMs: 10, spawnProcess });
      const bytes = Buffer.from("España");
      child.stdout.emit("data", bytes.subarray(0, 5)); child.stdout.emit("data", bytes.subarray(5));
      const result = await pending;
      expect(result.stdout).toBe("España");
      expect(result.error).toContain("timeout");
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
      expect(spawnProcess.mock.calls[0][2]).toMatchObject({ shell: false, cwd: tmpDir });
    });

    it("aborts before inference on auth failure", async () => {
      const promptFile = path.join(tmpDir, "prompt.txt");
      await fs.writeFile(promptFile, "Test prompt");
      const outDir = path.join(tmpDir, "out-auth-fail");

      const auth = jest.fn().mockRejectedValue(new Error("Authentication failed"));
      const run = jest.fn();
      await expect(main(["--prompt=" + promptFile, "--out-dir=" + outDir, "--execute"], { auth, run })).rejects.toThrow("Authentication");
      expect(run).not.toHaveBeenCalled();
      await expect(fs.access(outDir)).rejects.toThrow();
    });
  });
});
