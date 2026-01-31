---
name: linear
description: "Linear issues, comments, and webhooks. Use Linear webhooks to trigger the agent on every comment, issue assignment, and other events; use the Linear API or MCP for queries and updates."
metadata: { "openclaw": { "emoji": "📋", "requires": {}, "install": [] } }
---

# Linear + Webhooks

Trigger the agent from Linear on comments, issue assignments, and other events via webhooks, then use the agent to triage, summarize, or reply.

## Enable gateway hooks

In config (e.g. `~/.openclaw/config.json5`):

```json5
{
  hooks: {
    enabled: true,
    token: "your-shared-secret",
    path: "/hooks",
    transformsDir: "~/.openclaw/hooks",
    mappings: [
      {
        id: "linear",
        match: { path: "linear" },
        action: "agent",
        wakeMode: "now",
        name: "Linear",
        channel: "last",
        deliver: false,
        transform: {
          module: "linear-webhook-transform.mjs",
          export: "default",
        },
      },
    ],
  },
}
```

- `transformsDir`: directory containing the transform script (copy from this skill or build from source).
- Linear will POST to `https://your-gateway/hooks/linear` with `Authorization: Bearer your-shared-secret` (or `x-openclaw-token`).

## Linear webhook setup

1. **Linear** → Settings → API → Webhooks → New webhook.
2. **URL**: your gateway hook URL, e.g. `https://gateway.example.com/hooks/linear?token=SECRET` or use header auth.
3. **Resource types**: enable at least:
   - **Issue** (create, update, remove) — includes assignment changes.
   - **Comment** (create, update, remove) — every comment.
4. Optionally enable: Issue attachments, Issue labels, Projects, Cycles.
5. Copy the **signing secret**; use it in the transform to verify `Linear-Signature` (see Securing below).

## Transform script

The mapping uses a transform that turns Linear’s payload into an agent message. Copy `skills/linear/scripts/linear-webhook-transform.mjs` into `hooks.transformsDir`.

Transform output:

- **Issue** events: e.g. "Linear Issue [create]: ENG-42 — Title. Assignee: X. URL: …"
- **Comment** events: e.g. "Linear Comment [create] on issue: body snippet… By: Actor. URL: …"

So every comment and issue (including assignment) sends one agent run with that context.

## Securing

- **Gateway token**: Always set `hooks.token` and send it (header or query) so only Linear and you can call the hook.
- **Linear signature**: Linear sends `Linear-Signature` (HMAC-SHA256 of body with the webhook signing secret). The provided transform does not verify it; for production, either verify in a reverse proxy before forwarding to the gateway, or add verification inside the transform using the raw body (if your runtime exposes it) and `LINEAR_WEBHOOK_SECRET`.

## Agent behavior

After a webhook triggers the agent:

- The agent receives a short message describing the Linear event (type, action, actor, link, and relevant data).
- Use `channel: "last"` and `deliver: false` in the mapping to only run the agent and post a summary to the main session, or set `deliver: true` and `channel`/`to` to send replies to Slack/Telegram/etc.
- The agent can use the Linear API (e.g. via `mcporter` + Linear MCP server) or [Linear CLI](https://github.com/Finesssee/linear-cli) to comment back, change assignees, or update issues.

## Optional: direct POST to /hooks/agent

If you run a small middleware that receives Linear webhooks, verifies the signature, and then POSTs to the gateway:

```bash
curl -X POST https://gateway/hooks/agent \
  -H "Authorization: Bearer SECRET" \
  -H "Content-Type: application/json" \
  -d '{"message":"Linear Comment: ...","name":"Linear","sessionKey":"linear:delivery-id","wakeMode":"now","channel":"last","deliver":false}'
```

That avoids the transform and lets you fully control the message text.
