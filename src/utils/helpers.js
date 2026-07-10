

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

export const getAvailablePlayers = (rosteredPlayers, allPlayers) => {
    const allRosteredPlayerIds = new Set(rosteredPlayers);
    return allPlayers.filter((player) => (
        !allRosteredPlayerIds.has(player.id) && isOnActiveNflRoster(player)
    ));
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