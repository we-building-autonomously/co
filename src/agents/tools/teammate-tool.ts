import type { Tool } from "@anthropic-ai/sdk/resources/messages.mjs";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { sendMessageSlack } from "../../slack/send.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { createTeammatesManager } from "../teammates.js";

export function createTeammateTool(options?: {
  agentSessionKey?: string;
  config?: OpenClawConfig;
}): AnyAgentTool {
  const tool: Tool & {
    run: (params: Record<string, unknown>) => Promise<AgentToolResult<unknown>>;
  } = {
    name: "teammates",
    description: `Manage and communicate with team members. This tool helps you:
- List all team members and their expertise areas
- Get detailed information about specific teammates
- Send direct messages to teammates

Use this when you need to:
- Know who's on the team
- Find someone with specific expertise
- Communicate with a teammate directly
- Check teammate availability or contact info`,
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "get", "message"],
          description:
            "Action to perform: list (show all teammates), get (get info about specific teammate), message (send direct message)",
        },
        teammate: {
          type: "string",
          description: "Teammate name or ID (required for 'get' and 'message' actions)",
        },
        message: {
          type: "string",
          description: "Message content (required for 'message' action)",
        },
        type: {
          type: "string",
          enum: ["human", "agent", "bot"],
          description: "Filter by teammate type (for 'list' action)",
        },
        expertise: {
          type: "string",
          description: "Filter by expertise area (for 'list' action)",
        },
        active: {
          type: "boolean",
          description: "Filter by active status (for 'list' action)",
        },
        preferredChannel: {
          type: "string",
          description: "Preferred communication channel (for 'message' action)",
        },
      },
      required: ["action"],
    },
    async run(params: Record<string, unknown>): Promise<AgentToolResult<unknown>> {
      const action = params.action as string;
      const agentId = options?.agentSessionKey
        ? resolveSessionAgentId(options.agentSessionKey)
        : "default";
      const manager = createTeammatesManager(options?.config ?? {}, agentId);

      try {
        switch (action) {
          case "list": {
            const teammates = manager.listTeammates({
              type: params.type as string | undefined,
              hasExpertise: params.expertise as string | undefined,
              active: params.active as boolean | undefined,
            });

            if (teammates.length === 0) {
              return {
                ok: false,
                result: "No teammates found matching criteria.",
              };
            }

            const summary = teammates
              .map((t) => {
                const parts = [
                  `**${t.name}** (${t.type})`,
                  t.role ? `  Role: ${t.role}` : null,
                  t.expertise?.length ? `  Expertise: ${t.expertise.join(", ")}` : null,
                  t.timezone ? `  Timezone: ${t.timezone}` : null,
                  t.active === false ? "  Status: Inactive" : null,
                ].filter(Boolean);
                return parts.join("\n");
              })
              .join("\n\n");

            return {
              ok: true,
              result: `Found ${teammates.length} teammate(s):\n\n${summary}`,
            };
          }

          case "get": {
            if (!params.teammate) {
              return {
                ok: false,
                result: "Error: 'teammate' parameter is required for 'get' action",
              };
            }

            const teammate = manager.getTeammate(params.teammate as string);
            if (!teammate) {
              return {
                ok: false,
                result: `Teammate not found: ${params.teammate}`,
              };
            }

            const details = [
              `**${teammate.name}**`,
              `ID: ${teammate.id}`,
              `Type: ${teammate.type}`,
              teammate.role ? `Role: ${teammate.role}` : null,
              teammate.expertise?.length ? `Expertise: ${teammate.expertise.join(", ")}` : null,
              teammate.contacts?.length
                ? `Contacts: ${teammate.contacts.map((c) => `${c.type} (${c.id})`).join(", ")}`
                : null,
              teammate.timezone ? `Timezone: ${teammate.timezone}` : null,
              teammate.workingHours
                ? `Working Hours: ${teammate.workingHours.start} - ${teammate.workingHours.end}`
                : null,
              `Status: ${teammate.active !== false ? "Active" : "Inactive"}`,
              teammate.lastSeen ? `Last Seen: ${new Date(teammate.lastSeen).toISOString()}` : null,
            ].filter(Boolean);

            return {
              ok: true,
              result: details.join("\n"),
            };
          }

          case "message": {
            if (!params.teammate) {
              return {
                ok: false,
                result: "Error: 'teammate' parameter is required for 'message' action",
              };
            }
            if (!params.message) {
              return {
                ok: false,
                result: "Error: 'message' parameter is required for 'message' action",
              };
            }

            const teammate = manager.getTeammate(params.teammate as string);
            if (!teammate) {
              return {
                ok: false,
                result: `Teammate not found: ${params.teammate}`,
              };
            }

            const message = params.message as string;
            const preferredChannel = params.preferredChannel as string | undefined;

            // Get contact info
            const contact = manager.getContact(teammate, preferredChannel);
            if (!contact) {
              return {
                ok: false,
                result: `No contact method available for ${teammate.name}`,
              };
            }

            // Send message based on contact type
            if (contact.type === "slack") {
              await sendMessageSlack(contact.id, message, {
                accountId: contact.accountId,
              });

              return {
                ok: true,
                result: `Message sent to ${teammate.name} via Slack`,
              };
            }

            // Add support for other channels here
            return {
              ok: false,
              result: `Contact type ${contact.type} not yet supported for direct messaging`,
            };
          }

          default:
            return {
              ok: false,
              result: `Unknown action: ${action}`,
            };
        }
      } catch (error) {
        return {
          ok: false,
          result: `Error: ${String(error)}`,
        };
      }
    },
  };

  return tool;
}
