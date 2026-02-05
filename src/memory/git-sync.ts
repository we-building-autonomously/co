import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GitSyncConfig } from "../config/types.agent-defaults.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const execAsync = promisify(exec);
const log = createSubsystemLogger("memory/git-sync");

export type GitSyncResult = {
  success: boolean;
  pulled: boolean;
  pushed: boolean;
  committed: boolean;
  changes?: string[];
  error?: string;
};

export class MemoryGitSyncManager {
  constructor(
    private workspaceDir: string,
    private config: GitSyncConfig,
  ) {}

  /**
   * Initialize git repository if not exists
   */
  async init(): Promise<void> {
    const gitDir = path.join(this.workspaceDir, ".git");
    const exists = await fs.stat(gitDir).catch(() => null);

    if (!exists) {
      log.info("Initializing git repository", { workspaceDir: this.workspaceDir });
      await this.runGit(["init"]);
      await this.runGit(["remote", "add", "origin", this.config.repository]);
      await this.configureGitIdentity();
    } else {
      // Ensure remote is configured correctly
      try {
        const { stdout } = await this.runGit(["remote", "get-url", "origin"]);
        if (stdout.trim() !== this.config.repository) {
          log.info("Updating remote URL", {
            old: stdout.trim(),
            new: this.config.repository,
          });
          await this.runGit(["remote", "set-url", "origin", this.config.repository]);
        }
      } catch {
        // Remote doesn't exist, add it
        await this.runGit(["remote", "add", "origin", this.config.repository]);
      }
      await this.configureGitIdentity();
    }
  }

  /**
   * Configure git user identity
   */
  private async configureGitIdentity(): Promise<void> {
    const name = this.config.author?.name || "OpenClaw Agent";
    const email = this.config.author?.email || "agent@openclaw.ai";

    await this.runGit(["config", "user.name", name]);
    await this.runGit(["config", "user.email", email]);
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasChanges(): Promise<boolean> {
    try {
      const { stdout } = await this.runGit(["status", "--porcelain"]);
      return stdout.trim().length > 0;
    } catch (error) {
      log.error("Failed to check git status", { error });
      return false;
    }
  }

  /**
   * Get list of changed files
   */
  async getChangedFiles(): Promise<string[]> {
    try {
      const { stdout } = await this.runGit(["status", "--porcelain"]);
      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => line.slice(3)); // Remove status prefix
    } catch (error) {
      log.error("Failed to get changed files", { error });
      return [];
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(): Promise<GitSyncResult> {
    if (!this.config.autoPull) {
      return { success: true, pulled: false, pushed: false, committed: false };
    }

    try {
      log.info("Pulling from remote", {
        repository: this.config.repository,
        branch: this.config.branch || "main",
      });

      const strategy = this.resolveGitStrategy(this.config.conflictStrategy);
      const branch = this.config.branch || "main";

      // Check if remote branch exists
      try {
        await this.runGit(["fetch", "origin", branch]);
      } catch {
        log.info("Remote branch not found, will create on first push");
        return { success: true, pulled: false, pushed: false, committed: false };
      }

      // Check if we have any commits
      try {
        await this.runGit(["rev-parse", "HEAD"]);
      } catch {
        // No commits yet, just checkout the branch
        log.info("No local commits yet, creating branch");
        await this.runGit(["checkout", "-b", branch]);
        return { success: true, pulled: false, pushed: false, committed: false };
      }

      await this.runGit([
        "pull",
        ...(strategy ? [`--strategy=${strategy}`] : []),
        "origin",
        branch,
      ]);

      log.info("Pull completed successfully");
      return { success: true, pulled: true, pushed: false, committed: false };
    } catch (error) {
      log.error("Pull failed", { error });
      return {
        success: false,
        pulled: false,
        pushed: false,
        committed: false,
        error: String(error),
      };
    }
  }

  /**
   * Commit changes
   */
  async commit(message?: string): Promise<GitSyncResult> {
    if (!this.config.autoCommit) {
      return { success: true, pulled: false, pushed: false, committed: false };
    }

    try {
      const hasChanges = await this.hasChanges();
      if (!hasChanges) {
        log.debug("No changes to commit");
        return { success: true, pulled: false, pushed: false, committed: false };
      }

      const changes = await this.getChangedFiles();
      const commitMessage = message || this.buildCommitMessage();

      log.info("Committing changes", { files: changes.length });

      // Add files (respecting paths filter if configured)
      if (this.config.paths && this.config.paths.length > 0) {
        for (const pattern of this.config.paths) {
          await this.runGit(["add", pattern]);
        }
      } else {
        await this.runGit(["add", "."]);
      }

      // Exclude paths if configured
      if (this.config.excludePaths && this.config.excludePaths.length > 0) {
        for (const pattern of this.config.excludePaths) {
          await this.runGit(["reset", "--", pattern]);
        }
      }

      await this.runGit(["commit", "-m", commitMessage]);

      log.info("Commit completed", { message: commitMessage });
      return {
        success: true,
        pulled: false,
        pushed: false,
        committed: true,
        changes,
      };
    } catch (error) {
      log.error("Commit failed", { error });
      return {
        success: false,
        pulled: false,
        pushed: false,
        committed: false,
        error: String(error),
      };
    }
  }

  /**
   * Push changes to remote
   */
  async push(): Promise<GitSyncResult> {
    if (!this.config.autoPush) {
      return { success: true, pulled: false, pushed: false, committed: false };
    }

    try {
      const branch = this.config.branch || "main";

      log.info("Pushing to remote", {
        repository: this.config.repository,
        branch,
      });

      await this.runGit(["push", "-u", "origin", branch]);

      log.info("Push completed successfully");
      return { success: true, pulled: false, pushed: true, committed: false };
    } catch (error) {
      log.error("Push failed", { error });
      return {
        success: false,
        pulled: false,
        pushed: false,
        committed: false,
        error: String(error),
      };
    }
  }

  /**
   * Full sync: pull, commit, push
   */
  async sync(): Promise<GitSyncResult> {
    log.info("Starting memory sync", {
      repository: this.config.repository,
      onHeartbeat: this.config.onHeartbeat,
    });

    // Run pre-sync hook
    if (this.config.hooks?.preSync) {
      await this.runHook(this.config.hooks.preSync, "pre");
    }

    // Pull
    const pullResult = await this.pull();
    if (!pullResult.success) {
      return pullResult;
    }

    // Commit
    const commitResult = await this.commit();
    if (!commitResult.success) {
      return commitResult;
    }

    // Push
    const pushResult = await this.push();
    if (!pushResult.success) {
      return pushResult;
    }

    // Run post-sync hook
    if (this.config.hooks?.postSync) {
      await this.runHook(this.config.hooks.postSync, "post");
    }

    log.info("Memory sync completed", {
      pulled: pullResult.pulled,
      committed: commitResult.committed,
      pushed: pushResult.pushed,
      changes: commitResult.changes,
    });

    return {
      success: true,
      pulled: pullResult.pulled,
      committed: commitResult.committed,
      pushed: pushResult.pushed,
      changes: commitResult.changes,
    };
  }

  /**
   * Build commit message from template
   */
  private buildCommitMessage(): string {
    const template = this.config.commitMessage || "chore: agent memory sync {timestamp}";

    return template.replace("{timestamp}", new Date().toISOString());
  }

  /**
   * Resolve git merge strategy from conflict strategy
   */
  private resolveGitStrategy(strategy?: GitSyncConfig["conflictStrategy"]): string | null {
    switch (strategy) {
      case "local-wins":
        return "ours";
      case "remote-wins":
        return "theirs";
      case "manual":
      case "timestamp-wins":
      case "merge-markers":
        return null; // Use default merge
      default:
        return "ours"; // Default to local-wins
    }
  }

  /**
   * Run git command in workspace
   */
  private async runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const cmd = `git ${args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ")}`;

    log.debug("Running git command", { cmd, cwd: this.workspaceDir });

    return execAsync(cmd, {
      cwd: this.workspaceDir,
      encoding: "utf-8",
    });
  }

  /**
   * Run sync hook script
   */
  private async runHook(hookPath: string, type: "pre" | "post"): Promise<void> {
    try {
      log.info(`Running ${type}-sync hook`, { path: hookPath });

      const { stdout, stderr } = await execAsync(hookPath, {
        cwd: this.workspaceDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          OPENCLAW_WORKSPACE: this.workspaceDir,
          OPENCLAW_SYNC_TYPE: type,
        },
      });

      if (stdout) log.debug(`Hook stdout: ${stdout}`);
      if (stderr) log.warn(`Hook stderr: ${stderr}`);
    } catch (error) {
      log.error(`${type}-sync hook failed`, { error, path: hookPath });
      throw error;
    }
  }
}
