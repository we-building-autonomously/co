import type { Tool } from "@anthropic-ai/sdk/resources/messages.mjs";
import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import { sendMessageSlack } from "../../slack/send.js";
import { createTeammatesManager } from "../teammates.js";

export function createTeammateTools(cfg: OpenClawConfig, agentId: string): Tool[] {
  const manager = createTeammatesManager(cfg, agentId);

  return [
    {
      name: "teammates_list",
      description:
        "List all team members. Use this to see who you can communicate with and their expertise areas.",
      input_schema: Type.Object({
        type: Type.Optional(
          Type.Unsafe<"human" | "agent" | "bot">({
            type: "string",
            enum: ["human", "agent", "bot"],
            description: "Filter by teammate type",
          }),
        ),
        expertise: Type.Optional(
          Type.String({
            description: "Filter by expertise area (partial match)",
          }),
        ),
        active: Type.Optional(
          Type.Boolean({
            description: "Filter by active status",
          }),
        ),
      }),
    },
    {
      name: "teammates_get",
      description:
        "Get detailed information about a specific teammate by name or ID. Returns their role, expertise, contact methods, and availability.",
      input_schema: Type.Object({
        teammate: Type.String({
          description: "Teammate name or ID",
        }),
      }),
    },
    {
      name: "teammates_message",
      description:
        "Send a direct message to a teammate. Use this to communicate with team members directly.",
      input_schema: Type.Object({
        teammate: Type.String({
          description: "Teammate name or ID to message",
        }),
        message: Type.String({
          description: "Message content to send",
        }),
        preferredChannel: Type.Optional(
          Type.String({
            description: "Preferred communication channel (slack, discord, etc.)",
          }),
        ),
      }),
    },
  ];
}

export async function handleTeammateAction(
  toolName: string,
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
  agentId: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const manager = createTeammatesManager(cfg, agentId);

  switch (toolName) {
    case "teammates_list": {
      const teammates = manager.listTeammates({
        type: params.type as string | undefined,
        hasExpertise: params.expertise as string | undefined,
        active: params.active as boolean | undefined,
      });

      return {
        ok: true,
        result: teammates.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          role: t.role,
          expertise: t.expertise,
          active: t.active,
          timezone: t.timezone,
          lastSeen: t.lastSeen,
        })),
      };
    }

    case "teammates_get": {
      const teammate = manager.getTeammate(params.teammate as string);
      if (!teammate) {
        return {
          ok: false,
          error: `Teammate not found: ${params.teammate}`,
        };
      }

      return {
        ok: true,
        result: {
          id: teammate.id,
          name: teammate.name,
          type: teammate.type,
          role: teammate.role,
          expertise: teammate.expertise,
          contacts: teammate.contacts,
          timezone: teammate.timezone,
          workingHours: teammate.workingHours,
          active: teammate.active,
          lastSeen: teammate.lastSeen,
        },
      };
    }

    case "teammates_message": {
      const teammate = manager.getTeammate(params.teammate as string);
      if (!teammate) {
        return {
          ok: false,
          error: `Teammate not found: ${params.teammate}`,
        };
      }

      const message = params.message as string;
      const preferredChannel = params.preferredChannel as string | undefined;

      // Get contact info
      const contact = manager.getContact(teammate, preferredChannel);
      if (!contact) {
        return {
          ok: false,
          error: `No contact method available for ${teammate.name}`,
        };
      }

      // Send message based on contact type
      try {
        if (contact.type === "slack") {
          await sendMessageSlack(contact.id, message, {
            // Will use default client from config
          });

          return {
            ok: true,
            result: {
              sent: true,
              to: teammate.name,
              via: "slack",
            },
          };
        }

        // Add support for other channels here (Discord, Telegram, etc.)
        return {
          ok: false,
          error: `Contact type ${contact.type} not yet supported for direct messaging`,
        };
      } catch (error) {
        return {
          ok: false,
          error: `Failed to send message: ${String(error)}`,
        };
      }
    }

    default:
      return {
        ok: false,
        error: `Unknown teammate tool: ${toolName}`,
      };
  }
}
