import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { ProjectConfig } from "../config/types.agent-defaults.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agents/project-memory");

export type MemoryContent = {
  /** File path relative to memory directory. */
  path: string;
  /** File content. */
  content: string;
  /** Source: personal or project. */
  source: "personal" | "project";
};

/**
 * Load memory files from a directory
 */
async function loadMemoryFiles(
  memoryDir: string,
  source: "personal" | "project",
): Promise<MemoryContent[]> {
  try {
    const stat = await fs.stat(memoryDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    // Directory doesn't exist
    return [];
  }

  const files: MemoryContent[] = [];

  async function scanDir(dir: string, relativePath: string = ""): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          await scanDir(fullPath, relPath);
        } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
          try {
            const content = await fs.readFile(fullPath, "utf-8");
            files.push({
              path: relPath,
              content,
              source,
            });
          } catch (error) {
            log.warn("Failed to read memory file", { path: fullPath, error: String(error) });
          }
        }
      }
    } catch (error) {
      log.warn("Failed to scan memory directory", { dir, error: String(error) });
    }
  }

  await scanDir(memoryDir);
  return files;
}

/**
 * Load agent's personal memory
 */
export async function loadPersonalMemory(agentMemoryDir: string): Promise<MemoryContent[]> {
  return loadMemoryFiles(agentMemoryDir, "personal");
}

/**
 * Load project-specific memory
 */
export async function loadProjectMemory(projectMemoryDir: string): Promise<MemoryContent[]> {
  return loadMemoryFiles(projectMemoryDir, "project");
}

/**
 * Load combined memory: personal + project
 */
export async function loadCombinedMemory(
  agentMemoryDir: string,
  project?: ProjectConfig,
): Promise<MemoryContent[]> {
  const personalMemory = await loadPersonalMemory(agentMemoryDir);

  if (!project?.memoryPath) {
    return personalMemory;
  }

  const projectMemory = await loadProjectMemory(project.memoryPath);

  log.debug("Loaded combined memory", {
    personal: personalMemory.length,
    project: projectMemory.length,
    projectId: project.id,
  });

  // Return personal memory first, then project memory
  // This way project-specific knowledge is more recent in context
  return [...personalMemory, ...projectMemory];
}

/**
 * Format memory for system prompt
 */
export function formatMemoryForPrompt(memories: MemoryContent[]): string {
  if (memories.length === 0) {
    return "";
  }

  const sections: string[] = [];

  // Group by source
  const personalFiles = memories.filter((m) => m.source === "personal");
  const projectFiles = memories.filter((m) => m.source === "project");

  if (personalFiles.length > 0) {
    sections.push("# Personal Memory\n");
    for (const file of personalFiles) {
      sections.push(`## ${file.path}\n\n${file.content}\n`);
    }
  }

  if (projectFiles.length > 0) {
    sections.push("\n# Project Memory\n");
    for (const file of projectFiles) {
      sections.push(`## ${file.path}\n\n${file.content}\n`);
    }
  }

  return sections.join("\n");
}

/**
 * Get memory directory paths
 */
export function getMemoryPaths(
  cfg: OpenClawConfig,
  agentId: string,
  project?: ProjectConfig,
): {
  personal: string;
  project?: string;
} {
  const agentConfig = cfg.agents?.list?.find((a) => a.id === agentId);
  const workspace = agentConfig?.workspace ?? cfg.agents?.defaults?.workspace;
  const baseDir = workspace ?? process.cwd();

  // Personal memory path
  const personalMemoryPath = path.join(baseDir, ".openclaw", "agents", agentId, "memory");

  // Project memory path
  const projectMemoryPath = project?.memoryPath ? path.resolve(project.memoryPath) : undefined;

  return {
    personal: personalMemoryPath,
    project: projectMemoryPath,
  };
}

/**
 * Determine if content should be saved to personal or project memory
 * This is a heuristic - can be enhanced with LLM classification
 */
export function determineMemoryScope(
  content: string,
  project?: ProjectConfig,
): "personal" | "project" {
  if (!project) {
    return "personal";
  }

  // Keywords that suggest project-specific content
  const projectKeywords = [
    "architecture",
    "this project",
    "our project",
    "team decided",
    "project decision",
    "api endpoint",
    "database schema",
    "deployment",
    project.name.toLowerCase(),
  ];

  const contentLower = content.toLowerCase();
  const hasProjectKeywords = projectKeywords.some((keyword) => contentLower.includes(keyword));

  // Keywords that suggest personal/general content
  const personalKeywords = [
    "technique",
    "pattern",
    "best practice",
    "general",
    "always",
    "usually",
    "in general",
  ];

  const hasPersonalKeywords = personalKeywords.some((keyword) => contentLower.includes(keyword));

  // If both or neither, prefer project (safer to scope narrowly)
  if (hasProjectKeywords && !hasPersonalKeywords) {
    return "project";
  }
  if (hasPersonalKeywords && !hasProjectKeywords) {
    return "personal";
  }

  // Default to project if we have a project context
  return "project";
}
