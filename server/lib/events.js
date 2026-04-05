const subscribers = new Map();

function formatSseMessage(type, payload) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function subscribeToUserEvents(userId, res) {
  const current = subscribers.get(userId) ?? new Set();
  current.add(res);
  subscribers.set(userId, current);

  res.write(formatSseMessage("connected", { ok: true }));

  return () => {
    const set = subscribers.get(userId);
    if (!set) {
      return;
    }
    set.delete(res);
    if (set.size === 0) {
      subscribers.delete(userId);
    }
  };
}

export function publishUserEvent(userId, type, payload) {
  const current = subscribers.get(userId);
  if (!current) {
    return;
  }

  const message = formatSseMessage(type, payload);
  for (const res of current) {
    res.write(message);
  }
}

export function publishUserEvents(userIds, type, payload) {
  for (const userId of userIds) {
    publishUserEvent(userId, type, payload);
  }
}
