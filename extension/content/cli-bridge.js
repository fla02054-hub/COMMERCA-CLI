(() => {
  const POLL_MS = 500;
  let running = false;

  async function poll() {
    if (running) return;
    running = true;
    try {
      const command = await chrome.runtime.sendMessage({ type: 'POLL_COMMAND' });
      if (!command?.id || command.type !== 'SEARCH') return;

      let result;
      try {
        result = await chrome.runtime.sendMessage({ type: 'SEARCH', query: command.query });
      } catch (error) {
        result = { error: String(error) };
      }

      await chrome.runtime.sendMessage({
        type: 'SEARCH_RESULT',
        id: command.id,
        result,
        error: result?.error,
      });
    } finally {
      running = false;
    }
  }

  setInterval(poll, POLL_MS);
  poll();
})();
