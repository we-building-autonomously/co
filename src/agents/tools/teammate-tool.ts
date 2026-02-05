import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { sendMessageSlack } from "../../slack/send.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { createTeammatesManager } from "../teammates.js";
import { jsonResult } from "./common.js";

const TeammateToolSchema = Type.Object({
  action: Type.Unsafe<"list" | "get" | "message">({
    type: "string",
    enum: ["list", "get", "message"],
    description:
      "Action to perform: list (show all teammates), get (get info about specific teammate), message (send direct message)",
  }),
  teammate: Type.Optional(
    Type.String({
      description: "Teammate name or ID (required for 'get' and 'message' actions)",
    }),
  ),
  message: Type.Optional(
    Type.String({
      description: "Message content (required for 'message' action)",
    }),
  ),
  type: Type.Optional(
    Type.Unsafe<"human" | "agent" | "bot">({
      type: "string",
      enum: ["human", "agent", "bot"],
      description: "Filter by teammate type (for 'list' action)",
    }),
  ),
  expertise: Type.Optional(
    Type.String({
      description: "Filter by expertise area (for 'list' action)",
    }),
  ),
  active: Type.Optional(
    Type.Boolean({
      description: "Filter by active status (for 'list' action)",
    }),
  ),
  preferredChannel: Type.Optional(
    Type.String({
      description: "Preferred communication channel (for 'message' action)",
    }),
  ),
});

export function createTeammateTool(options?: {
  agentSessionKey?: string;
  config?: OpenClawConfig;
  projectId?: string;
}): AnyAgentTool {
  return {
    label: "Team",
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
    parameters: TeammateToolSchema,
    async execute(_toolCallId, args) {
      const params = args as Record<string, unknown>;
      const action = params.action as string;
      const agentId = options?.agentSessionKey
        ? resolveSessionAgentId(options.agentSessionKey)
        : "default";
      const manager = createTeammatesManager(options?.config ?? {}, agentId, options?.projectId);

      try {
        switch (action) {
          case "list": {
            const teammates = manager.listTeammates({
              type: params.type as string | undefined,
              hasExpertise: params.expertise as string | undefined,
              active: params.active as boolean | undefined,
            });

            if (teammates.length === 0) {
              return jsonResult({
                ok: false,
                error: "No teammates found matching criteria.",
              });
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

            return jsonResult({
              ok: true,
              result: `Found ${teammates.length} teammate(s):\n\n${summary}`,
            });
          }

          case "get": {
            if (!params.teammate) {
              return jsonResult({
                ok: false,
                error: "'teammate' parameter is required for 'get' action",
              });
            }

            const teammate = manager.getTeammate(params.teammate as string);
            if (!teammate) {
              return jsonResult({
                ok: false,
                error: `Teammate not found: ${params.teammate}`,
              });
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

            return jsonResult({
              ok: true,
              result: details.join("\n"),
            });
          }

          case "message": {
            if (!params.teammate) {
              return jsonResult({
                ok: false,
                error: "'teammate' parameter is required for 'message' action",
              });
            }
            if (!params.message) {
              return jsonResult({
                ok: false,
                error: "'message' parameter is required for 'message' action",
              });
            }

            const teammate = manager.getTeammate(params.teammate as string);
            if (!teammate) {
              return jsonResult({
                ok: false,
                error: `Teammate not found: ${params.teammate}`,
              });
            }

            const message = params.message as string;
            const preferredChannel = params.preferredChannel as string | undefined;

            // Get contact info
            const contact = manager.getContact(teammate, preferredChannel);
            if (!contact) {
              return jsonResult({
                ok: false,
                error: `No contact method available for ${teammate.name}`,
              });
            }

            // Send message based on contact type
            if (contact.type === "slack") {
              await sendMessageSlack(contact.id, message, {
                accountId: contact.accountId,
              });

              return jsonResult({
                ok: true,
                result: `Message sent to ${teammate.name} via Slack`,
              });
            }

            // Add support for other channels here
            return jsonResult({
              ok: false,
              error: `Contact type ${contact.type} not yet supported for direct messaging`,
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
