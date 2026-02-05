import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { createProjectsManager, type ProjectDetectionContext } from "../projects.js";
import { jsonResult } from "./common.js";

const ProjectToolSchema = Type.Object({
  action: Type.Unsafe<"list" | "get" | "current" | "switch" | "detect">({
    type: "string",
    enum: ["list", "get", "current", "switch", "detect"],
    description:
      "Action: list (all projects), get (specific project), current (current project), switch (change project), detect (auto-detect from context)",
  }),
  projectId: Type.Optional(
    Type.String({
      description: "Project ID (required for 'get' and 'switch' actions)",
    }),
  ),
  workingDirectory: Type.Optional(
    Type.String({
      description: "Working directory for 'detect' action",
    }),
  ),
  slackChannelId: Type.Optional(
    Type.String({
      description: "Slack channel ID for 'detect' action",
    }),
  ),
  githubRepo: Type.Optional(
    Type.String({
      description: "GitHub repository (org/repo) for 'detect' action",
    }),
  ),
});

export function createProjectTool(options?: {
  agentSessionKey?: string;
  config?: OpenClawConfig;
}): AnyAgentTool {
  return {
    label: "Projects",
    name: "project",
    description: `Manage and detect projects. Use this to:
- List all configured projects
- Get details about a specific project
- View the current active project
- Switch between projects
- Detect project from context (workspace, Slack, GitHub)

Projects organize work with separate memories, teammates, Slack channels, and GitHub repos.`,
    parameters: ProjectToolSchema,
    async execute(_toolCallId, args) {
      const params = args as Record<string, unknown>;
      const action = params.action as string;
      const agentId = options?.agentSessionKey
        ? resolveSessionAgentId(options.agentSessionKey)
        : "default";
      const manager = createProjectsManager(options?.config ?? {}, agentId);

      try {
        switch (action) {
          case "list": {
            const projects = manager.listProjects();

            if (projects.length === 0) {
              return jsonResult({
                ok: false,
                error: "No projects configured.",
              });
            }

            const currentId = manager.getCurrentProject()?.id;
            const summary = projects
              .map((p) => {
                const parts = [
                  `**${p.name}** (${p.id})${currentId === p.id ? " [CURRENT]" : ""}`,
                  p.description ? `  ${p.description}` : null,
                  p.workspacePath ? `  Workspace: ${p.workspacePath}` : null,
                  p.slackChannels?.length ? `  Slack Channels: ${p.slackChannels.length}` : null,
                  p.githubRepos?.length ? `  GitHub Repos: ${p.githubRepos.join(", ")}` : null,
                  p.teammates?.length ? `  Team Members: ${p.teammates.length}` : null,
                ].filter(Boolean);
                return parts.join("\n");
              })
              .join("\n\n");

            return jsonResult({
              ok: true,
              result: `Found ${projects.length} project(s):\n\n${summary}`,
            });
          }

          case "get": {
            if (!params.projectId) {
              return jsonResult({
                ok: false,
                error: "'projectId' parameter is required for 'get' action",
              });
            }

            const project = manager.getProject(params.projectId as string);
            if (!project) {
              return jsonResult({
                ok: false,
                error: `Project not found: ${params.projectId}`,
              });
            }

            const details = [
              `**${project.name}**`,
              `ID: ${project.id}`,
              project.description ? `Description: ${project.description}` : null,
              project.workspacePath ? `Workspace: ${project.workspacePath}` : null,
              project.memoryPath ? `Memory Path: ${project.memoryPath}` : null,
              project.slackChannels?.length
                ? `Slack Channels: ${project.slackChannels.join(", ")}`
                : null,
              project.githubRepos?.length
                ? `GitHub Repos: ${project.githubRepos.join(", ")}`
                : null,
              project.teammates?.length
                ? `Team Members: ${project.teammates.map((t) => t.name).join(", ")}`
                : null,
              `Status: ${project.active !== false ? "Active" : "Inactive"}`,
              project.created ? `Created: ${new Date(project.created).toISOString()}` : null,
              project.lastActive
                ? `Last Active: ${new Date(project.lastActive).toISOString()}`
                : null,
            ].filter(Boolean);

            return jsonResult({
              ok: true,
              result: details.join("\n"),
            });
          }

          case "current": {
            const project = manager.getCurrentProject();
            if (!project) {
              return jsonResult({
                ok: false,
                error: "No current project set",
              });
            }

            return jsonResult({
              ok: true,
              result: `Current project: ${project.name} (${project.id})`,
            });
          }

          case "switch": {
            if (!params.projectId) {
              return jsonResult({
                ok: false,
                error: "'projectId' parameter is required for 'switch' action",
              });
            }

            const projectId = params.projectId as string;
            const project = manager.getProject(projectId);
            if (!project) {
              return jsonResult({
                ok: false,
                error: `Project not found: ${projectId}`,
              });
            }

            manager.setCurrentProject(projectId);
            manager.updateLastActive(projectId);

            return jsonResult({
              ok: true,
              result: `Switched to project: ${project.name} (${project.id})`,
            });
          }

          case "detect": {
            const context: ProjectDetectionContext = {
              workingDirectory: params.workingDirectory as string | undefined,
              slackChannelId: params.slackChannelId as string | undefined,
              githubRepo: params.githubRepo as string | undefined,
            };

            const project = manager.detectProject(context);
            if (!project) {
              return jsonResult({
                ok: false,
                error: "Could not detect project from context",
              });
            }

            return jsonResult({
              ok: true,
              result: `Detected project: ${project.name} (${project.id})`,
            });
          }

          default:
            return jsonResult({
              ok: false,
              error: `Unknown action: ${action}`,
            });
        }
      } catch (error) {
        return jsonResult({
          ok: false,
          error: `Error: ${String(error)}`,
        });
      }
    },
  };
}
