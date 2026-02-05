import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { ProjectConfig, ProjectsConfig } from "../config/types.agent-defaults.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agents/projects");

export type ProjectDetectionContext = {
  /** Current working directory. */
  workingDirectory?: string;
  /** Slack channel ID. */
  slackChannelId?: string;
  /** GitHub repository (org/repo format). */
  githubRepo?: string;
};

export class ProjectsManager {
  private projects: Map<string, ProjectConfig>;
  private projectsConfig: ProjectsConfig;
  private currentProjectId?: string;

  // Reverse lookups for fast detection
  private workspaceToProject: Map<string, string>;
  private slackChannelToProject: Map<string, string>;
  private githubRepoToProject: Map<string, string>;

  constructor(projectsConfig?: ProjectsConfig) {
    this.projects = new Map();
    this.projectsConfig = projectsConfig ?? {};
    this.workspaceToProject = new Map();
    this.slackChannelToProject = new Map();
    this.githubRepoToProject = new Map();
    this.currentProjectId = projectsConfig?.current;

    this.loadProjects();
    this.buildLookupMaps();
  }

  /**
   * Load projects from configuration
   */
  private loadProjects(): void {
    if (!this.projectsConfig.list) {
      return;
    }

    for (const project of this.projectsConfig.list) {
      if (project.active !== false) {
        this.projects.set(project.id, project);
      }
    }

    log.info("Loaded projects", { count: this.projects.size });
  }

  /**
   * Build reverse lookup maps for fast project detection
   */
  private buildLookupMaps(): void {
    for (const [projectId, project] of this.projects.entries()) {
      // Workspace path lookup
      if (project.workspacePath) {
        const normalized = path.resolve(project.workspacePath);
        this.workspaceToProject.set(normalized, projectId);
      }

      // Slack channel lookups
      if (project.slackChannels) {
        for (const channelId of project.slackChannels) {
          this.slackChannelToProject.set(channelId, projectId);
        }
      }

      // GitHub repo lookups
      if (project.githubRepos) {
        for (const repo of project.githubRepos) {
          const normalized = repo.toLowerCase();
          this.githubRepoToProject.set(normalized, projectId);
        }
      }
    }

    log.debug("Built project lookup maps", {
      workspaces: this.workspaceToProject.size,
      slackChannels: this.slackChannelToProject.size,
      githubRepos: this.githubRepoToProject.size,
    });
  }

  /**
   * Get project by ID
   */
  getProject(projectId: string): ProjectConfig | undefined {
    return this.projects.get(projectId);
  }

  /**
   * Get current project
   */
  getCurrentProject(): ProjectConfig | undefined {
    if (!this.currentProjectId) {
      return undefined;
    }
    return this.projects.get(this.currentProjectId);
  }

  /**
   * Set current project
   */
  setCurrentProject(projectId: string | undefined): void {
    if (projectId && !this.projects.has(projectId)) {
      log.warn("Attempted to set non-existent project as current", { projectId });
      return;
    }
    this.currentProjectId = projectId;
    log.info("Current project changed", { projectId });
  }

  /**
   * List all active projects
   */
  listProjects(): ProjectConfig[] {
    return Array.from(this.projects.values());
  }

  /**
   * Detect project from context
   */
  detectProject(context: ProjectDetectionContext): ProjectConfig | undefined {
    if (!this.projectsConfig.autoDetect) {
      return this.getCurrentProject();
    }

    // Try workspace path
    if (context.workingDirectory) {
      const project = this.detectFromWorkspace(context.workingDirectory);
      if (project) {
        log.debug("Project detected from workspace", {
          projectId: project.id,
          workspace: context.workingDirectory,
        });
        return project;
      }
    }

    // Try Slack channel
    if (context.slackChannelId) {
      const project = this.detectFromSlackChannel(context.slackChannelId);
      if (project) {
        log.debug("Project detected from Slack channel", {
          projectId: project.id,
          channelId: context.slackChannelId,
        });
        return project;
      }
    }

    // Try GitHub repo
    if (context.githubRepo) {
      const project = this.detectFromGithubRepo(context.githubRepo);
      if (project) {
        log.debug("Project detected from GitHub repo", {
          projectId: project.id,
          repo: context.githubRepo,
        });
        return project;
      }
    }

    // Fall back to current project
    return this.getCurrentProject();
  }

  /**
   * Detect project from workspace path
   */
  private detectFromWorkspace(workspacePath: string): ProjectConfig | undefined {
    const normalized = path.resolve(workspacePath);

    // Try exact match first
    const exactMatch = this.workspaceToProject.get(normalized);
    if (exactMatch) {
      return this.projects.get(exactMatch);
    }

    // Try parent directories (find closest match)
    let currentPath = normalized;
    while (currentPath !== path.dirname(currentPath)) {
      const projectId = this.workspaceToProject.get(currentPath);
      if (projectId) {
        return this.projects.get(projectId);
      }
      currentPath = path.dirname(currentPath);
    }

    return undefined;
  }

  /**
   * Detect project from Slack channel
   */
  private detectFromSlackChannel(channelId: string): ProjectConfig | undefined {
    const projectId = this.slackChannelToProject.get(channelId);
    return projectId ? this.projects.get(projectId) : undefined;
  }

  /**
   * Detect project from GitHub repository
   */
  private detectFromGithubRepo(repo: string): ProjectConfig | undefined {
    const normalized = repo.toLowerCase();
    const projectId = this.githubRepoToProject.get(normalized);
    return projectId ? this.projects.get(projectId) : undefined;
  }

  /**
   * Add or update a project
   */
  addProject(project: ProjectConfig): void {
    this.projects.set(project.id, project);
    this.buildLookupMaps();
    log.info("Project added/updated", { projectId: project.id });
  }

  /**
   * Remove a project
   */
  removeProject(projectId: string): boolean {
    const removed = this.projects.delete(projectId);
    if (removed) {
      this.buildLookupMaps();
      if (this.currentProjectId === projectId) {
        this.currentProjectId = undefined;
      }
      log.info("Project removed", { projectId });
    }
    return removed;
  }

  /**
   * Update project last active timestamp
   */
  updateLastActive(projectId: string): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.lastActive = Date.now();
    }
  }

  /**
   * Get project memory path
   */
  getProjectMemoryPath(projectId: string): string | undefined {
    const project = this.projects.get(projectId);
    return project?.memoryPath;
  }

  /**
   * Check if a Slack channel belongs to a project
   */
  isProjectSlackChannel(channelId: string): boolean {
    return this.slackChannelToProject.has(channelId);
  }

  /**
   * Check if a GitHub repo belongs to a project
   */
  isProjectGithubRepo(repo: string): boolean {
    return this.githubRepoToProject.has(repo.toLowerCase());
  }
}

/**
 * Create projects manager from config
 */
export function createProjectsManager(cfg: OpenClawConfig, agentId?: string): ProjectsManager {
  const agentConfig = cfg.agents?.list?.find((a) => a.id === agentId);
  const projectsConfig = agentConfig?.projects ?? cfg.agents?.defaults?.projects;

  return new ProjectsManager(projectsConfig);
}
