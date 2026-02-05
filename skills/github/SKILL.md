---
name: github
description: "Interact with GitHub using the `gh` CLI. Use `gh issue`, `gh pr`, `gh run`, and `gh api` for issues, PRs, CI runs, and advanced queries."
metadata:
  {
    "openclaw":
      {
        "emoji": "🐙",
        "requires": { "bins": ["gh"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "gh",
              "bins": ["gh"],
              "label": "Install GitHub CLI (brew)",
            },
            {
              "id": "apt",
              "kind": "apt",
              "package": "gh",
              "bins": ["gh"],
              "label": "Install GitHub CLI (apt)",
            },
          ],
      },
  }
---

# GitHub Skill

Interact with GitHub using both the `gh` CLI and the programmatic `github` agent tool. Always specify `--repo owner/repo` or use the `repo` parameter when not in a git directory.

## GitHub Agent Tool (Programmatic API)

The `github` tool provides programmatic PR automation for agent-to-agent collaboration and workflows.

### Configuration

Add to `~/.openclaw/config.json`:

```json
{
  "github": {
    "baseBranch": "main",
    "mergeStrategy": "squash",
    "autoDeleteBranch": true
  }
}
```

### Actions

**create_pr** - Create a new pull request:

```typescript
github {
  action: "create_pr",
  title: "feat: add feature",
  body: "## Summary\n...",
  head: "feature-branch",
  base: "main",        // optional, defaults to config
  draft: false,        // optional
  repo: "owner/repo"   // optional if in git dir
}
```

**get_pr** - Fetch PR details, reviews, and status:

```typescript
github {
  action: "get_pr",
  prNumber: 42,
  repo: "owner/repo"
}
```

**review_pr** - Approve, request changes, or comment:

```typescript
github {
  action: "review_pr",
  prNumber: 42,
  reviewAction: "approve",  // or "request_changes" or "comment"
  reviewBody: "LGTM!",
  repo: "owner/repo"
}
```

**comment_pr** - Add a comment to a PR:

```typescript
github {
  action: "comment_pr",
  prNumber: 42,
  comment: "Please update the tests",
  repo: "owner/repo"
}
```

**merge_pr** - Merge a pull request:

```typescript
github {
  action: "merge_pr",
  prNumber: 42,
  mergeStrategy: "squash",     // optional, defaults to config
  deleteHeadBranch: true,      // optional, defaults to config
  repo: "owner/repo"
}
```

**list_prs** - List pull requests:

```typescript
github {
  action: "list_prs",
  state: "open",          // or "closed", "merged", "all"
  limit: 30,              // optional
  author: "username",     // optional
  label: "bug",           // optional
  repo: "owner/repo"
}
```

### Agent-to-Agent PR Workflow Example

```typescript
// Agent A: Create PR
github { action: "create_pr", title: "feat: new feature", body: "...", head: "feat-branch", base: "main" }

// Agent B: Review PR
github { action: "get_pr", prNumber: 42 }
// ... run tests, check code ...
github { action: "review_pr", prNumber: 42, reviewAction: "approve", reviewBody: "✅ All tests pass" }

// Agent B: Merge PR
github { action: "merge_pr", prNumber: 42, mergeStrategy: "squash" }
```

## GitHub CLI (gh) for Manual Operations

## Pull Requests

Check CI status on a PR:

```bash
gh pr checks 55 --repo owner/repo
```

List recent workflow runs:

```bash
gh run list --repo owner/repo --limit 10
```

View a run and see which steps failed:

```bash
gh run view <run-id> --repo owner/repo
```

View logs for failed steps only:

```bash
gh run view <run-id> --repo owner/repo --log-failed
```

## API for Advanced Queries

The `gh api` command is useful for accessing data not available through other subcommands.

Get PR with specific fields:

```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
```

## JSON Output

Most commands support `--json` for structured output. You can use `--jq` to filter:

```bash
gh issue list --repo owner/repo --json number,title --jq '.[] | "\(.number): \(.title)"'
```
