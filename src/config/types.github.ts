export type GitHubConfig = {
  /** Default base branch for PRs (e.g., "main", "master"). Default: "main". */
  baseBranch?: string;
  /** Default merge strategy ("merge", "squash", or "rebase"). Default: "squash". */
  mergeStrategy?: "merge" | "squash" | "rebase";
  /** Automatically delete the head branch after merging. Default: true. */
  autoDeleteBranch?: boolean;
};
