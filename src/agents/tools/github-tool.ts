import { Type } from "@sinclair/typebox";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { OpenClawConfig } from "../../config/config.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

const execAsync = promisify(exec);

const GitHubToolSchema = Type.Object({
  action: Type.Unsafe<
    "create_pr" | "get_pr" | "review_pr" | "comment_pr" | "merge_pr" | "list_prs"
  >({
    type: "string",
    enum: ["create_pr", "get_pr", "review_pr", "comment_pr", "merge_pr", "list_prs"],
  }),
  // PR creation
  title: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  head: Type.Optional(Type.String()),
  base: Type.Optional(Type.String()),
  draft: Type.Optional(Type.Boolean()),
  // PR reference
  prNumber: Type.Optional(Type.Number()),
  repo: Type.Optional(Type.String()),
  // Review
  reviewAction: Type.Optional(
    Type.Unsafe<"approve" | "request_changes" | "comment">({
      type: "string",
      enum: ["approve", "request_changes", "comment"],
    }),
  ),
  reviewBody: Type.Optional(Type.String()),
  // Comment
  comment: Type.Optional(Type.String()),
  // Merge
  mergeStrategy: Type.Optional(
    Type.Unsafe<"merge" | "squash" | "rebase">({
      type: "string",
      enum: ["merge", "squash", "rebase"],
    }),
  ),
  deleteHeadBranch: Type.Optional(Type.Boolean()),
  // List PRs
  state: Type.Optional(
    Type.Unsafe<"open" | "closed" | "merged" | "all">({
      type: "string",
      enum: ["open", "closed", "merged", "all"],
    }),
  ),
  limit: Type.Optional(Type.Number()),
  author: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
});

async function runGhCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes("Waiting for") && !stderr.includes("Loading")) {
      console.error(`gh stderr: ${stderr}`);
    }
    return stdout.trim();
  } catch (error) {
    const err = error as { code?: number; stderr?: string; stdout?: string };
    throw new Error(`GitHub CLI command failed: ${err.stderr || err.stdout || String(error)}`, {
      cause: error,
    });
  }
}

async function parseJsonOutput<T>(output: string): Promise<T> {
  try {
    return JSON.parse(output) as T;
  } catch {
    throw new Error(`Failed to parse GitHub CLI JSON output: ${output.substring(0, 200)}`);
  }
}

function buildRepoFlag(repo?: string): string {
  return repo ? `--repo ${repo}` : "";
}

export function createGithubTool(options?: { config?: OpenClawConfig }): AnyAgentTool {
  const config = options?.config?.github;
  const defaultBase = config?.baseBranch || "main";
  const defaultMergeStrategy = config?.mergeStrategy || "squash";
  const defaultAutoDeleteBranch = config?.autoDeleteBranch ?? true;

  return {
    label: "GitHub",
    name: "github",
    description: [
      "Interact with GitHub pull requests programmatically.",
      "Actions: create_pr, get_pr, review_pr, comment_pr, merge_pr, list_prs.",
      "Requires GitHub CLI (gh) to be installed and authenticated.",
      "Use repo parameter to specify owner/repo when not in a git directory.",
    ].join(" "),
    parameters: GitHubToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const repo = readStringParam(params, "repo");
      const repoFlag = buildRepoFlag(repo);

      switch (action) {
        case "create_pr": {
          const title = readStringParam(params, "title", { required: true });
          const body = readStringParam(params, "body") || "";
          const head = readStringParam(params, "head", { required: true });
          const base = readStringParam(params, "base") || defaultBase;
          const draft = Boolean(params.draft);

          const draftFlag = draft ? "--draft" : "";
          const command = `gh pr create ${repoFlag} --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --head "${head}" --base "${base}" ${draftFlag} --json number,url,title,state`;

          const output = await runGhCommand(command);
          const result = await parseJsonOutput<{
            number: number;
            url: string;
            title: string;
            state: string;
          }>(output);

          return jsonResult({
            success: true,
            pr: result,
            message: `Created PR #${result.number}: ${result.title}`,
          });
        }

        case "get_pr": {
          const prNumber = typeof params.prNumber === "number" ? params.prNumber : undefined;
          if (!prNumber) {
            throw new Error("prNumber required for get_pr action");
          }

          const command = `gh pr view ${prNumber} ${repoFlag} --json number,title,body,state,isDraft,url,headRefName,baseRefName,mergeable,mergeStateStatus,reviewDecision,reviews,comments,additions,deletions,changedFiles,createdAt,updatedAt,mergedAt,closedAt,author,labels,assignees`;

          const output = await runGhCommand(command);
          const result = await parseJsonOutput(output);

          return jsonResult({
            success: true,
            pr: result,
          });
        }

        case "review_pr": {
          const prNumber = typeof params.prNumber === "number" ? params.prNumber : undefined;
          if (!prNumber) {
            throw new Error("prNumber required for review_pr action");
          }

          const reviewAction = readStringParam(params, "reviewAction", {
            required: true,
          }) as "approve" | "request_changes" | "comment";
          const reviewBody = readStringParam(params, "reviewBody") || "";

          let reviewFlag: string;
          switch (reviewAction) {
            case "approve":
              reviewFlag = "--approve";
              break;
            case "request_changes":
              reviewFlag = "--request-changes";
              break;
            case "comment":
              reviewFlag = "--comment";
              break;
            default:
              throw new Error(`Invalid reviewAction: ${reviewAction}`);
          }

          const bodyFlag = reviewBody ? `--body "${reviewBody.replace(/"/g, '\\"')}"` : "";
          const command = `gh pr review ${prNumber} ${repoFlag} ${reviewFlag} ${bodyFlag}`;

          await runGhCommand(command);

          return jsonResult({
            success: true,
            message: `Reviewed PR #${prNumber} with action: ${reviewAction}`,
            prNumber,
            action: reviewAction,
          });
        }

        case "comment_pr": {
          const prNumber = typeof params.prNumber === "number" ? params.prNumber : undefined;
          if (!prNumber) {
            throw new Error("prNumber required for comment_pr action");
          }

          const comment = readStringParam(params, "comment", { required: true });
          const command = `gh pr comment ${prNumber} ${repoFlag} --body "${comment.replace(/"/g, '\\"')}"`;

          await runGhCommand(command);

          return jsonResult({
            success: true,
            message: `Added comment to PR #${prNumber}`,
            prNumber,
          });
        }

        case "merge_pr": {
          const prNumber = typeof params.prNumber === "number" ? params.prNumber : undefined;
          if (!prNumber) {
            throw new Error("prNumber required for merge_pr action");
          }

          const mergeStrategy =
            (readStringParam(params, "mergeStrategy") as
              | "merge"
              | "squash"
              | "rebase"
              | undefined) || defaultMergeStrategy;
          const deleteHeadBranch =
            typeof params.deleteHeadBranch === "boolean"
              ? params.deleteHeadBranch
              : defaultAutoDeleteBranch;

          let strategyFlag: string;
          switch (mergeStrategy) {
            case "merge":
              strategyFlag = "--merge";
              break;
            case "squash":
              strategyFlag = "--squash";
              break;
            case "rebase":
              strategyFlag = "--rebase";
              break;
            default:
              throw new Error(`Invalid mergeStrategy: ${mergeStrategy}`);
          }

          const deleteFlag = deleteHeadBranch ? "--delete-branch" : "";
          const command = `gh pr merge ${prNumber} ${repoFlag} ${strategyFlag} ${deleteFlag} --auto`;

          await runGhCommand(command);

          return jsonResult({
            success: true,
            message: `Merged PR #${prNumber} with strategy: ${mergeStrategy}`,
            prNumber,
            strategy: mergeStrategy,
            deletedBranch: deleteHeadBranch,
          });
        }

        case "list_prs": {
          const state = readStringParam(params, "state") || "open";
          const limit = typeof params.limit === "number" ? params.limit : 30;
          const author = readStringParam(params, "author");
          const label = readStringParam(params, "label");

          const stateFlag = `--state ${state}`;
          const limitFlag = `--limit ${limit}`;
          const authorFlag = author ? `--author "${author}"` : "";
          const labelFlag = label ? `--label "${label}"` : "";

          const command = `gh pr list ${repoFlag} ${stateFlag} ${limitFlag} ${authorFlag} ${labelFlag} --json number,title,state,url,headRefName,createdAt,updatedAt,author,labels,isDraft,reviewDecision`;

          const output = await runGhCommand(command);
          const prs = await parseJsonOutput<unknown[]>(output);

          return jsonResult({
            success: true,
            count: prs.length,
            prs,
          });
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
