import type { OpenClawConfig } from "../config/config.js";
import type {
  TeamConfig,
  TeammateConfig,
  TeammateContact,
} from "../config/types.agent-defaults.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agents/teammates");

export type TeammateInfo = TeammateConfig & {
  /** Last seen timestamp (for auto-discovered teammates). */
  lastSeen?: number;
  /** Discovery source (slack, discord, etc.). */
  discoveredFrom?: string;
};

export type TeammateMessageOptions = {
  /** Message content. */
  content: string;
  /** Optional media URL. */
  mediaUrl?: string;
  /** Preferred contact method (if multiple available). */
  preferredContact?: string;
};

export class TeammatesManager {
  private teammates: Map<string, TeammateInfo>;
  private teamConfig: TeamConfig;

  constructor(teamConfig?: TeamConfig) {
    this.teammates = new Map();
    this.teamConfig = teamConfig ?? {};
    this.loadConfiguredTeammates();
  }

  /**
   * Load teammates from configuration
   */
  private loadConfiguredTeammates(): void {
    if (!this.teamConfig.members) {
      return;
    }

    for (const member of this.teamConfig.members) {
      this.teammates.set(member.id, {
        ...member,
      });
    }

    log.info("Loaded teammates from config", { count: this.teammates.size });
  }

  /**
   * Add or update a teammate
   */
  addTeammate(teammate: TeammateInfo): void {
    this.teammates.set(teammate.id, teammate);
    log.debug("Added teammate", { id: teammate.id, name: teammate.name });
  }

  /**
   * Get teammate by ID or name
   */
  getTeammate(idOrName: string): TeammateInfo | undefined {
    // Try exact ID match first
    let teammate = this.teammates.get(idOrName);
    if (teammate) {
      return teammate;
    }

    // Try name match (case-insensitive)
    const normalized = idOrName.toLowerCase();
    for (const member of this.teammates.values()) {
      if (member.name.toLowerCase() === normalized) {
        return member;
      }
    }

    return undefined;
  }

  /**
   * List all teammates
   */
  listTeammates(options?: {
    type?: string;
    active?: boolean;
    hasExpertise?: string;
  }): TeammateInfo[] {
    let teammates = Array.from(this.teammates.values());

    if (options?.type) {
      teammates = teammates.filter((t) => t.type === options.type);
    }

    if (options?.active !== undefined) {
      teammates = teammates.filter((t) => t.active === options.active);
    }

    if (options?.hasExpertise) {
      const expertise = options.hasExpertise.toLowerCase();
      teammates = teammates.filter((t) =>
        t.expertise?.some((e) => e.toLowerCase().includes(expertise)),
      );
    }

    return teammates;
  }

  /**
   * Find teammate by contact
   */
  findByContact(type: string, id: string): TeammateInfo | undefined {
    for (const teammate of this.teammates.values()) {
      if (!teammate.contacts) {
        continue;
      }

      for (const contact of teammate.contacts) {
        if (contact.type === type && contact.id === id) {
          return teammate;
        }
      }
    }

    return undefined;
  }

  /**
   * Get contact for teammate
   */
  getContact(teammate: TeammateInfo, preferredType?: string): TeammateContact | undefined {
    if (!teammate.contacts || teammate.contacts.length === 0) {
      return undefined;
    }

    // Try preferred type first
    if (preferredType) {
      const contact = teammate.contacts.find((c) => c.type === preferredType);
      if (contact) {
        return contact;
      }
    }

    // Return first available
    return teammate.contacts[0];
  }

  /**
   * Update teammate last seen
   */
  updateLastSeen(idOrName: string, timestamp?: number): void {
    const teammate = this.getTeammate(idOrName);
    if (teammate) {
      teammate.lastSeen = timestamp ?? Date.now();
    }
  }

  /**
   * Discover teammate from Slack user
   */
  discoverFromSlack(
    userId: string,
    userInfo: {
      name?: string;
      real_name?: string;
      tz?: string;
      is_bot?: boolean;
    },
  ): TeammateInfo {
    const existing = this.findByContact("slack", userId);
    if (existing) {
      this.updateLastSeen(existing.id);
      return existing;
    }

    const teammate: TeammateInfo = {
      id: `slack-${userId}`,
      name: userInfo.real_name || userInfo.name || userId,
      type: userInfo.is_bot ? "bot" : "human",
      contacts: [{ type: "slack", id: userId }],
      timezone: userInfo.tz,
      active: true,
      lastSeen: Date.now(),
      discoveredFrom: "slack",
    };

    this.addTeammate(teammate);
    return teammate;
  }

  /**
   * Get teammate summary for agent context
   */
  getTeammateSummary(teammate: TeammateInfo): string {
    const parts = [
      `**${teammate.name}**`,
      teammate.role ? `- Role: ${teammate.role}` : null,
      teammate.type ? `- Type: ${teammate.type}` : null,
      teammate.expertise?.length ? `- Expertise: ${teammate.expertise.join(", ")}` : null,
      teammate.timezone ? `- Timezone: ${teammate.timezone}` : null,
    ].filter(Boolean);

    return parts.join("\n");
  }

  /**
   * Get all teammates summary for system prompt
   */
  getTeamSummary(): string {
    const teammates = this.listTeammates({ active: true });
    if (teammates.length === 0) {
      return "No teammates configured.";
    }

    const sections = ["# Team Members", "", ...teammates.map((t) => this.getTeammateSummary(t))];

    return sections.join("\n");
  }

  /**
   * Export teammates as JSON
   */
  exportTeammates(): TeammateInfo[] {
    return Array.from(this.teammates.values());
  }
}

/**
 * Create teammates manager from config
 */
export function createTeammatesManager(cfg: OpenClawConfig, agentId?: string): TeammatesManager {
  const agentConfig = cfg.agents?.list?.find((a) => a.id === agentId);
  const teamConfig = agentConfig?.team ?? cfg.agents?.defaults?.team;

  return new TeammatesManager(teamConfig);
}
