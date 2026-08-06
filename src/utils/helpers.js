

export const getPlayerDetails = (playerId, allPlayers) => 
    allPlayers.find(p => p.id === playerId) || {};

/** True when the player is attached to a real NFL team (not FA / unrostered). */
export const isOnActiveNflRoster = (player) => {
    if (!player) return false;

    const team = String(player.nflTeam ?? player.team ?? '').trim().toUpperCase();
    if (!team || team === 'FA' || team === 'FREE AGENT' || team === 'NONE' || team === 'N/A') {
        return false;
    }

    const status = String(player.status ?? '').trim().toLowerCase();
    if (status.includes('free agent')) {
        return false;
    }

    return true;
};

export const getPlayerProjectedPoints = (player) => {
    const n = Number(
        player?.projectedPoints
        ?? player?.projected_points
        ?? player?.consensus_projection
    );
    return Number.isFinite(n) ? n : null;
};

export const getPlayerRank = (player) => {
    const n = Number(player?.rank ?? player?.search_rank);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 9999) return null;
    return n;
};

export const formatProjectedPoints = (player) => {
    const pts = getPlayerProjectedPoints(player);
    if (pts == null) return '—';
    return pts.toFixed(1);
};

/** Best available first: ESPN/rank ascending, then higher projected points. */
export const comparePlayersByRankAndProjection = (a, b) => {
    const rankA = getPlayerRank(a);
    const rankB = getPlayerRank(b);
    if (rankA != null && rankB != null && rankA !== rankB) return rankA - rankB;
    if (rankA != null && rankB == null) return -1;
    if (rankA == null && rankB != null) return 1;

    const projA = getPlayerProjectedPoints(a);
    const projB = getPlayerProjectedPoints(b);
    if (projA != null && projB != null && projA !== projB) return projB - projA;
    if (projA != null && projB == null) return -1;
    if (projA == null && projB != null) return 1;

    return String(a?.name || '').localeCompare(String(b?.name || ''));
};

export const sortPlayersByRankAndProjection = (players = []) => (
    [...players].sort(comparePlayersByRankAndProjection)
);

export const getAvailablePlayers = (rosteredPlayers, allPlayers) => {
    const allRosteredPlayerIds = new Set(rosteredPlayers);
    return sortPlayersByRankAndProjection(
        allPlayers.filter((player) => (
            !allRosteredPlayerIds.has(player.id) && isOnActiveNflRoster(player)
        ))
    );
};

export const shuffleArray = (array) => {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}; 