---
title: GitHub PR Automation
description: Automate pull request workflows with multi-agent collaboration
---

# GitHub PR Automation

OpenClaw provides programmatic GitHub PR automation through the `github` agent tool, enabling agent-to-agent collaboration, automated reviews, and sophisticated PR workflows.

## Prerequisites

1. **GitHub CLI installed**: The tool uses `gh` CLI under the hood

   ```bash
   brew install gh        # macOS
   sudo apt install gh    # Linux
   ```

2. **Authentication**: Authenticate with GitHub

   ```bash
   gh auth login
   ```

3. **Configuration**: Add GitHub settings to `~/.openclaw/config.json`
   ```json
   {
     "github": {
       "baseBranch": "main",
       "mergeStrategy": "squash",
       "autoDeleteBranch": true
     }
   }
   ```

## Configuration Options

| Option             | Type                                  | Default    | Description                         |
| ------------------ | ------------------------------------- | ---------- | ----------------------------------- |
| `baseBranch`       | string                                | `"main"`   | Default base branch for PRs         |
| `mergeStrategy`    | `"merge"` \| `"squash"` \| `"rebase"` | `"squash"` | Default merge strategy              |
| `autoDeleteBranch` | boolean                               | `true`     | Auto-delete head branch after merge |

## Tool Actions

### create_pr

Create a new pull request.

**Parameters:**

- `title` (required): PR title
- `body` (optional): PR description/body
- `head` (required): Source branch name
- `base` (optional): Target branch (defaults to config `baseBranch`)
- `draft` (optional): Create as draft PR
- `repo` (optional): Repository in `owner/repo` format

**Example:**

```typescript
github {
  action: "create_pr",
  title: "feat: add authentication system",
  body: "## Summary\n- Add OAuth support\n- Add JWT tokens\n\n## Test Plan\n- [ ] Test login flow\n- [ ] Test token refresh",
  head: "feat-auth",
  base: "main",
  draft: false,
  repo: "myorg/myrepo"
}
```

**Response:**

```json
{
  "success": true,
  "pr": {
    "number": 123,
    "url": "https://github.com/myorg/myrepo/pull/123",
    "title": "feat: add authentication system",
    "state": "OPEN"
  },
  "message": "Created PR #123: feat: add authentication system"
}
```

### get_pr

Fetch complete PR details including status, reviews, and metadata.

**Parameters:**

- `prNumber` (required): PR number
- `repo` (optional): Repository in `owner/repo` format

**Example:**

```typescript
github {
  action: "get_pr",
  prNumber: 123,
  repo: "myorg/myrepo"
}
```

**Response includes:**

- Basic info: `number`, `title`, `body`, `state`, `isDraft`, `url`
- Branch info: `headRefName`, `baseRefName`
- Merge status: `mergeable`, `mergeStateStatus`, `reviewDecision`
- Reviews and comments
- File changes: `additions`, `deletions`, `changedFiles`
- Timestamps: `createdAt`, `updatedAt`, `mergedAt`, `closedAt`
- Metadata: `author`, `labels`, `assignees`

### review_pr

Approve, request changes, or comment on a PR.

**Parameters:**

- `prNumber` (required): PR number
- `reviewAction` (required): `"approve"` | `"request_changes"` | `"comment"`
- `reviewBody` (optional): Review comment text
- `repo` (optional): Repository in `owner/repo` format

**Example:**

```typescript
github {
  action: "review_pr",
  prNumber: 123,
  reviewAction: "approve",
  reviewBody: "✅ APPROVED\n\n**Checks:**\n- All tests pass\n- Code follows style guide\n- Documentation updated",
  repo: "myorg/myrepo"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Reviewed PR #123 with action: approve",
  "prNumber": 123,
  "action": "approve"
}
```

### comment_pr

Add a comment to a PR (without formal review).

**Parameters:**

- `prNumber` (required): PR number
- `comment` (required): Comment text
- `repo` (optional): Repository in `owner/repo` format

**Example:**

```typescript
github {
  action: "comment_pr",
  prNumber: 123,
  comment: "⚠️ Please update the changelog before merging",
  repo: "myorg/myrepo"
}
```

### merge_pr

Merge a pull request using the specified strategy.

**Parameters:**

- `prNumber` (required): PR number
- `mergeStrategy` (optional): `"merge"` | `"squash"` | `"rebase"` (defaults to config)
- `deleteHeadBranch` (optional): Delete head branch after merge (defaults to config)
- `repo` (optional): Repository in `owner/repo` format

**Example:**

```typescript
github {
  action: "merge_pr",
  prNumber: 123,
  mergeStrategy: "squash",
  deleteHeadBranch: true,
  repo: "myorg/myrepo"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Merged PR #123 with strategy: squash",
  "prNumber": 123,
  "strategy": "squash",
  "deletedBranch": true
}
```

### list_prs

List pull requests with filters.

**Parameters:**

- `state` (optional): `"open"` | `"closed"` | `"merged"` | `"all"` (default: `"open"`)
- `limit` (optional): Maximum PRs to return (default: 30)
- `author` (optional): Filter by author username
- `label` (optional): Filter by label
- `repo` (optional): Repository in `owner/repo` format

**Example:**

```typescript
github {
  action: "list_prs",
  state: "open",
  limit: 10,
  author: "dependabot",
  repo: "myorg/myrepo"
}
```

**Response:**

```json
{
  "success": true,
  "count": 5,
  "prs": [
    {
      "number": 125,
      "title": "chore: bump dependencies",
      "state": "OPEN",
      "url": "https://github.com/myorg/myrepo/pull/125",
      "headRefName": "dependabot/npm_and_yarn/lodash-4.17.21",
      "createdAt": "2025-01-15T10:30:00Z",
      "author": { "login": "dependabot" },
      "isDraft": false,
      "reviewDecision": null
    }
  ]
}
```

## Multi-Agent Workflows

### Workflow 1: PR Creation and Automated Review

**Scenario**: Agent A creates code, Agent B reviews and merges.

```typescript
// Agent A: Create feature branch and PR
github {
  action: "create_pr",
  title: "feat: user profile page",
  body: "## Summary\nAdds user profile view with avatar and bio\n\n## Test Plan\n- Profile loads correctly\n- Avatar upload works\n- Bio editing persists",
  head: "feat-profile",
  base: "main"
}
// Response: { pr: { number: 42, ... } }

// Agent B: Fetch PR and review code
github { action: "get_pr", prNumber: 42 }

// Agent B: Run automated checks in a spawned workspace
// (run tests, linting, etc.)

// Agent B: Approve if checks pass
github {
  action: "review_pr",
  prNumber: 42,
  reviewAction: "approve",
  reviewBody: "✅ **APPROVED**\n\n**Automated Checks:**\n- ✓ All tests pass (127/127)\n- ✓ Lint clean\n- ✓ No type errors\n- ✓ Coverage: 94%"
}

// Agent B: Merge with squash
github {
  action: "merge_pr",
  prNumber: 42,
  mergeStrategy: "squash"
}
```

### Workflow 2: Cross-Repository Dependency Updates

**Scenario**: Agent monitors dependencies, creates update PRs across multiple repos.

```typescript
// Agent: Check for outdated dependencies and create PR
github {
  action: "create_pr",
  title: "chore: update OpenClaw to v2024.2.15",
  body: "## Changes\n- Update openclaw: 2024.2.10 → 2024.2.15\n\n## Changelog\nhttps://github.com/openclaw/openclaw/releases/tag/v2024.2.15",
  head: "deps-openclaw-2024.2.15",
  base: "main",
  repo: "team/project-a"
}

// Repeat for other repos
github {
  action: "create_pr",
  title: "chore: update OpenClaw to v2024.2.15",
  body: "...",
  head: "deps-openclaw-2024.2.15",
  repo: "team/project-b"
}
```

### Workflow 3: PR Notification and Status Updates

**Scenario**: Agent monitors PRs and posts status updates to team chat.

```typescript
// Agent: Poll for new PRs
github {
  action: "list_prs",
  state: "open",
  repo: "team/project"
}

// For each PR, check review status
github { action: "get_pr", prNumber: 123, repo: "team/project" }

// Post notification to Slack/Discord when review is needed
message {
  action: "send",
  target: "slack:team:#engineering",
  text: "🔔 PR #123 needs review: 'feat: new dashboard'\nhttps://github.com/team/project/pull/123"
}
```

### Workflow 4: Automated Testing and Review Gate

**Scenario**: Agent runs comprehensive tests before allowing merge.

```typescript
// Agent: Review PR request received
github { action: "get_pr", prNumber: 45 }

// Agent: Post initial comment
github {
  action: "comment_pr",
  prNumber: 45,
  comment: "🤖 Starting automated review...\n\n⏳ Running test suite..."
}

// Agent: Clone repo, checkout PR branch, run tests
// (spawn isolated session, run commands)

// Agent: Update with test results
github {
  action: "comment_pr",
  prNumber: 45,
  comment: "✅ Tests passed (234/234)\n⏳ Running security scan..."
}

// Agent: Run security checks, linting, coverage
// ...

// Agent: Final review decision
const allPassed = true; // based on checks
if (allPassed) {
  github {
    action: "review_pr",
    prNumber: 45,
    reviewAction: "approve",
    reviewBody: "✅ **Automated Review PASSED**\n\n**Summary:**\n- Tests: 234/234 ✓\n- Coverage: 87% ✓\n- Lint: Clean ✓\n- Security: No issues ✓\n\nReady to merge."
  }
} else {
  github {
    action: "review_pr",
    prNumber: 45,
    reviewAction: "request_changes",
    reviewBody: "❌ **Automated Review FAILED**\n\n**Issues:**\n- 3 tests failing\n- Coverage dropped below 80%"
  }
}
```

## Best Practices

### 1. Use Meaningful PR Titles and Descriptions

```typescript
// ✅ Good
github {
  action: "create_pr",
  title: "feat: add OAuth authentication with GitHub provider",
  body: "## Summary\nImplements OAuth flow...\n\n## Breaking Changes\nNone\n\n## Test Plan\n- [ ] Login flow\n- [ ] Logout flow"
}

// ❌ Bad
github {
  action: "create_pr",
  title: "updates",
  body: "some changes"
}
```

### 2. Include Comprehensive Review Comments

When reviewing, explain your reasoning:

```typescript
github {
  action: "review_pr",
  prNumber: 78,
  reviewAction: "request_changes",
  reviewBody: "## Issues Found\n\n### Security\n- Line 45: User input not sanitized (XSS risk)\n- Line 89: SQL query vulnerable to injection\n\n### Performance\n- Line 123: N+1 query pattern\n\n## Recommendations\n- Use parameterized queries\n- Add input validation middleware"
}
```

### 3. Check PR Status Before Merging

Always verify mergeable state and required checks:

```typescript
const pr = await github({ action: "get_pr", prNumber: 42 });

if (pr.mergeable === "MERGEABLE" && pr.reviewDecision === "APPROVED") {
  await github({ action: "merge_pr", prNumber: 42 });
} else {
  console.log("PR not ready to merge:", pr.mergeStateStatus);
}
```

### 4. Use Appropriate Merge Strategies

- **Squash**: Clean history, single commit (good for features)
- **Merge**: Preserve all commits (good for long-running branches)
- **Rebase**: Linear history (good for small fixes)

```typescript
// Feature work with many WIP commits → squash
github { action: "merge_pr", prNumber: 10, mergeStrategy: "squash" }

// Important architectural change → preserve history
github { action: "merge_pr", prNumber: 20, mergeStrategy: "merge" }

// Small bugfix with clean commits → rebase
github { action: "merge_pr", prNumber: 30, mergeStrategy: "rebase" }
```

### 5. Monitor PR Activity with Polling

Set up periodic checks for PR status changes:

```typescript
// In a cron job or scheduled task
const openPrs = await github({
  action: "list_prs",
  state: "open",
  repo: "team/project",
});

for (const pr of openPrs.prs) {
  const details = await github({
    action: "get_pr",
    prNumber: pr.number,
    repo: "team/project",
  });

  if (details.reviewDecision === "APPROVED" && details.mergeable === "MERGEABLE") {
    // Auto-merge if approved
    await github({
      action: "merge_pr",
      prNumber: pr.number,
      repo: "team/project",
    });
  }
}
```

## Error Handling

The tool throws descriptive errors for common issues:

```typescript
try {
  await github({ action: "merge_pr", prNumber: 99 });
} catch (error) {
  // Handle specific error cases
  if (error.message.includes("not mergeable")) {
    console.log("PR has conflicts or failing checks");
  } else if (error.message.includes("not found")) {
    console.log("PR does not exist");
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Limitations

- **Authentication**: Requires `gh` CLI to be authenticated
- **Permissions**: User must have appropriate repo permissions
- **Rate Limits**: Subject to GitHub API rate limits
- **Draft PRs**: Cannot merge draft PRs (must convert to ready first)
- **Protected Branches**: Must satisfy branch protection rules

## Troubleshooting

### "GitHub CLI command failed"

Ensure `gh` is installed and authenticated:

```bash
gh --version
gh auth status
```

### "Repository not found"

Specify the full `owner/repo` format:

```typescript
github { action: "get_pr", prNumber: 5, repo: "openclaw/openclaw" }
```

### "Permission denied"

Check your GitHub permissions:

```bash
gh auth refresh -s repo,workflow
```

### Rate limit errors

Check your rate limit status:

```bash
gh api rate_limit
```

## Related Documentation

- [GitHub Skills](/skills/github) - CLI commands and patterns
- [Multi-Agent Collaboration](/guides/agents#multi-agent) - Agent teamwork patterns
- [Message Tool](/tools/message) - Cross-channel notifications
- [Cron Jobs](/configuration/cron) - Scheduled PR monitoring
