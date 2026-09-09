/* Carde.io client.
 *
 * The shop's events live on the Carde.io 1.0 dashboard, and Riot reads store
 * activity from there. This talks to that API directly -- api.carde.io sends
 * Access-Control-Allow-Origin: * and allows the Authorization and Game-Id
 * headers, so no proxy is involved.
 *
 * Auth is Auth0 with no public login endpoint, so a real "Log in with Carde.io"
 * button would need Carde to register a callback for us. Until then the
 * organiser pastes their own bearer token, which expires and has to be
 * re-pasted -- see README.
 *
 * Request shapes below were taken from the dashboard's own client bundle.
 */

const Carde = (() => {
  const BASE = 'https://api.carde.io';
  const TOKEN_KEY = 'magma-chamber-carde-token';
  const CTX_KEY = 'magma-chamber-carde-context';

  const load = k => { try { return JSON.parse(localStorage.getItem(k)) ?? null; } catch { return null; } };
  const save = (k, v) => v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v));

  let token = load(TOKEN_KEY);
  let ctx = load(CTX_KEY) || {};   // {establishmentId, establishmentName, gameId, activityId, roundId}

  async function call(path, { method = 'GET', body, gameId } = {}) {
    if (!token) throw new Error('Not connected to Carde.io.');
    const headers = { Authorization: `Bearer ${token}` };
    // Carde is inconsistent about the casing; it accepts either.
    if (gameId ?? ctx.gameId) headers['Game-Id'] = gameId ?? ctx.gameId;
    if (body) headers['Content-Type'] = 'application/json';

    const res = await fetch(BASE + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) throw new Error('Token rejected — it has probably expired. Paste a fresh one.');
    if (res.status === 403) throw new Error('That account lacks permission for this action.');

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
    if (!res.ok) throw new Error(data?.errorMessage || data?.message || `Carde.io returned ${res.status}`);
    return data;
  }

  // Responses are wrapped as {data, pagination} on list routes.
  const unwrap = r => (r && Object.prototype.hasOwnProperty.call(r, 'data')) ? r.data : r;

  return {
    get token() { return token; },

    context: () => ({ ...ctx }),

    isConnected: () => !!token,

    setContext(patch) { ctx = { ...ctx, ...patch }; save(CTX_KEY, ctx); },

    disconnect() {
      token = null; ctx = {};
      save(TOKEN_KEY, null); save(CTX_KEY, null);
    },

    // Store the token, then prove it works by listing the stores it can see.
    async connect(newToken) {
      token = newToken.trim().replace(/^Bearer\s+/i, '');
      const stores = unwrap(await call('/api/play/establishments/')) || [];
      save(TOKEN_KEY, token);
      return stores;
    },

    establishments: async () => unwrap(await call('/api/play/establishments/')) || [],

    // A store's games; we need the Riftbound entry's id for the Game-Id header.
    games: async id => unwrap(await call(`/api/play/establishments/${id}/games`)) || [],

    events: async id => unwrap(await call(`/api/play/establishments/${id}/events`)) || [],

    activity: async id => unwrap(await call(`/api/play/activities/${id}`)),

    roster: async id => unwrap(await call(`/api/play/activities/${id}/roster`)) || [],

    pairings: async roundId =>
      unwrap(await call(`/api/play/tournamentRounds/${roundId}/pairings`)) || [],

    standings: async tournamentId =>
      unwrap(await call(`/api/play/tournaments/${tournamentId}/standings`)),

    /* Report a completed match.
     *
     * games is one entry per game played:
     *   { winner: <activityPhaseUserId>, didTie: false, firstPlayer: <activityPhaseUserId> }
     * A drawn game sets didTie true and leaves winner empty. The server works out
     * the match outcome by counting games won per seat, so a 2-0 and a 2-1 both
     * read as a win.
     */
    report: (pairingId, games, { isDoubleLoss = false, isIntentionalDraw = false } = {}) =>
      call(`/api/play/tournamentPairings/${pairingId}/report`, {
        method: 'POST',
        body: { isDoubleLoss, isIntentionalDraw, games },
      }),

    // Convenience: a straight win with no game-by-game detail.
    reportWinner: (pairingId, winnerId, wins = 1) =>
      call(`/api/play/tournamentPairings/${pairingId}/report`, {
        method: 'POST',
        body: {
          isDoubleLoss: false,
          isIntentionalDraw: false,
          games: Array.from({ length: wins }, () => ({ winner: winnerId, didTie: false })),
        },
      }),

    reportDraw: pairingId =>
      call(`/api/play/tournamentPairings/${pairingId}/report`, {
        method: 'POST',
        body: { isDoubleLoss: false, isIntentionalDraw: true, games: [] },
      }),

    reportDoubleLoss: pairingId =>
      call(`/api/play/tournamentPairings/${pairingId}/report`, {
        method: 'POST',
        body: { isDoubleLoss: true, isIntentionalDraw: false, games: [] },
      }),
  };
})();

if (typeof module !== 'undefined') module.exports = Carde;
