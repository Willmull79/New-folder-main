

export const getPlayerDetails = (playerId, allPlayers) => 
    allPlayers.find(p => p.id === playerId) || {};

export const getAvailablePlayers = (rosteredPlayers, allPlayers) => {
    const allRosteredPlayerIds = new Set(rosteredPlayers);
    return allPlayers.filter(player => !allRosteredPlayerIds.has(player.id));
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