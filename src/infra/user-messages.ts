// Queue for user messages (similar to system-events but for role:user messages)
// Used for automated reminders like cron jobs that should appear as user messages

export type UserMessage = { text: string; ts: number };

const MAX_MESSAGES = 20;

type SessionQueue = {
  queue: UserMessage[];
  lastText: string | null;
};

const queues = new Map<string, SessionQueue>();

type UserMessageOptions = {
  sessionKey: string;
};

function requireSessionKey(key?: string | null): string {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed) {
    throw new Error("user messages require a sessionKey");
  }
  return trimmed;
}

export function enqueueUserMessage(text: string, options: UserMessageOptions) {
  const key = requireSessionKey(options?.sessionKey);
  const entry =
    queues.get(key) ??
    (() => {
      const created: SessionQueue = {
        queue: [],
        lastText: null,
      };
      queues.set(key, created);
      return created;
    })();
  const cleaned = text.trim();
  if (!cleaned) {
    return;
  }
  if (entry.lastText === cleaned) {
    return;
  } // skip consecutive duplicates
  entry.lastText = cleaned;
  entry.queue.push({ text: cleaned, ts: Date.now() });
  if (entry.queue.length > MAX_MESSAGES) {
    entry.queue.shift();
  }
}

export function drainUserMessageEntries(sessionKey: string): UserMessage[] {
  const key = requireSessionKey(sessionKey);
  const entry = queues.get(key);
  if (!entry || entry.queue.length === 0) {
    return [];
  }
  const out = entry.queue.slice();
  entry.queue.length = 0;
  entry.lastText = null;
  queues.delete(key);
  return out;
}

export function drainUserMessages(sessionKey: string): string[] {
  return drainUserMessageEntries(sessionKey).map((msg) => msg.text);
}

export function peekUserMessages(sessionKey: string): string[] {
  const key = requireSessionKey(sessionKey);
  return queues.get(key)?.queue.map((m) => m.text) ?? [];
}

export function hasUserMessages(sessionKey: string) {
  const key = requireSessionKey(sessionKey);
  return (queues.get(key)?.queue.length ?? 0) > 0;
}

export function resetUserMessagesForTest() {
  queues.clear();
}
