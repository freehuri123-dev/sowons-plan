(function () {
  const STORAGE_KEY = "family-schedule-prototype";
  const EMPTY_STATE = { events: [], responses: [], anniversaries: [] };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeState(value, fallback = EMPTY_STATE) {
    const state = value && typeof value === "object" ? value : fallback;
    return {
      events: Array.isArray(state.events) ? state.events : [],
      responses: Array.isArray(state.responses) ? state.responses : [],
      anniversaries: Array.isArray(state.anniversaries)
        ? state.anniversaries
        : [],
    };
  }

  function loadLocalState(fallback) {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (!savedState) {
      return clone(fallback);
    }

    try {
      return normalizeState(JSON.parse(savedState), fallback);
    } catch {
      return clone(fallback);
    }
  }

  async function loadState(fallback = EMPTY_STATE) {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.ok) {
        const state = normalizeState(await response.json(), fallback);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return state;
      }
    } catch (error) {
      console.info("Using local schedule storage.", error);
    }

    return loadLocalState(fallback);
  }

  function loadCachedState(fallback = EMPTY_STATE) {
    return loadLocalState(fallback);
  }

  async function refreshState(fallback = EMPTY_STATE) {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Load failed: ${response.status}`);
    }

    const state = normalizeState(await response.json(), fallback);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  async function saveState(state) {
    const normalizedState = normalizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));

    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedState),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }
    } catch (error) {
      console.info("Saved schedule locally only.", error);
    }
  }

  window.familyStorage = {
    loadState,
    loadCachedState,
    refreshState,
    saveState,
    normalizeState,
  };
})();
