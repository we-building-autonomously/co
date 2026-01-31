/**
 * Linear webhook → OpenClaw agent hook transform.
 * Copy this file into hooks.transformsDir (e.g. ~/.openclaw/hooks/) and reference it
 * in hooks.mappings[].transform.module as "linear-webhook-transform.mjs".
 *
 * Linear payload: action, type, actor, data, url, createdAt, webhookId, ...
 * @see https://linear.app/developers/webhooks
 */

function safe(s) {
  if (s == null) return "";
  const t = typeof s === "string" ? s : String(s);
  return t.slice(0, 2000).replace(/\s+/g, " ").trim();
}

function buildMessage(payload) {
  const action = payload.action || "update";
  const type = payload.type || "Unknown";
  const actor = payload.actor;
  const actorName = actor?.name || actor?.email || "unknown";
  const data = payload.data || {};
  const url = payload.url || "";

  if (type === "Comment") {
    const body = safe(data.body);
    const issueId = data.issueId || "";
    return `Linear Comment [${action}] on issue ${issueId}: ${body || "(no body)"} — by ${actorName}. ${url}`.trim();
  }

  if (type === "Issue") {
    const title = safe(data.title);
    const identifier = data.identifier || data.id || "";
    const assignee = data.assignee?.name || data.assigneeId || "unassigned";
    const state = data.state?.name || data.stateId || "";
    const parts = [`Linear Issue [${action}]: ${identifier} — ${title || "(no title)"}`];
    if (action === "update" && payload.updatedFrom?.assigneeId !== undefined) {
      parts.push(`Assignee: ${assignee}`);
    } else if (assignee && assignee !== "unassigned") {
      parts.push(`Assignee: ${assignee}`);
    }
    if (state) parts.push(`State: ${state}`);
    parts.push(url);
    return parts.join(". ").trim();
  }

  return `Linear ${type} [${action}] — by ${actorName}. ${url}`.trim();
}

export default function linearWebhookTransform(ctx) {
  const { payload, headers } = ctx;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const message = buildMessage(payload);
  if (!message) return null;

  const deliveryId = headers["linear-delivery"] || payload.webhookId || payload.organizationId || "";
  const sessionKey = deliveryId ? `linear:${deliveryId}` : undefined;

  return {
    kind: "agent",
    message,
    name: "Linear",
    wakeMode: "now",
    sessionKey,
    deliver: false,
    channel: "last",
  };
}
