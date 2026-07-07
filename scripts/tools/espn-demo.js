// ESPN API Demo Component
// This component demonstrates how to use ESPN's free NFL API

const ESPNDemoComponent = ({ showMessage }) => {
    const [teams, setTeams] = useState([]);
    const [selectedTeam, setSelectedTeam] = useState('');
    const [teamRoster, setTeamRoster] = useState([]);
    const [standings, setStandings] = useState([]);
    const [scores, setScores] = useState([]);
    const [playerSearch, setPlayerSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('teams');

    // Load NFL teams
    const loadTeams = async () => {
        setIsLoading(true);
        try {
            const data = await window.apiService.getESPNTeams();
            setTeams(data.sports[0].leagues[0].teams || []);
            showMessage("NFL teams loaded successfully!", "success");
        } catch (error) {
            console.error("Failed to load teams:", error);
            showMessage("Failed to load teams. Check console for details.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Load team roster
    const loadTeamRoster = async (teamId) => {
        if (!teamId) return;
        setIsLoading(true);
        try {
            const data = await window.apiService.getESPNTeamRoster(teamId);
            setTeamRoster(data.athletes || []);
            showMessage("Team roster loaded successfully!", "success");
        } catch (error) {
            console.error("Failed to load roster:", error);
            showMessage("Failed to load roster.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Load standings
    const loadStandings = async () => {
        setIsLoading(true);
        try {
            const data = await window.apiService.getESPNStandings();
            setStandings(data.standings || []);
            showMessage("Standings loaded successfully!", "success");
        } catch (error) {
            console.error("Failed to load standings:", error);
            showMessage("Failed to load standings.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Load scores
    const loadScores = async () => {
        setIsLoading(true);
        try {
            const data = await window.apiService.getESPNScores();
            setScores(data.events || []);
            showMessage("Scores loaded successfully!", "success");
        } catch (error) {
            console.error("Failed to load scores:", error);
            showMessage("Failed to load scores.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Search players
    const searchPlayers = async () => {
        if (!playerSearch.trim()) return;
        setIsLoading(true);
        try {
            const data = await window.apiService.getESPNPlayerSearch(playerSearch);
            setSearchResults(data.athletes || []);
            showMessage(`Found ${data.athletes?.length || 0} players!`, "success");
        } catch (error) {
            console.error("Failed to search players:", error);
            showMessage("Failed to search players.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Load initial data
    useEffect(() => {
        loadTeams();
    }, []);

    const renderTeamsTab = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-blue-400">NFL Teams</h3>
                <button 
                    onClick={loadTeams}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold disabled:opacity-50"
                >
                    {isLoading ? 'Loading...' : 'Refresh Teams'}
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map(team => (
                    <div key={team.team.id} className="bg-gray-700 p-4 rounded-lg">
                        <div className="flex items-center gap-3 mb-3">
                            {team.team.logos && team.team.logos[0] && (
                                <img 
                                    src={team.team.logos[0].href} 
                                    alt={team.team.name}
                                    className="w-8 h-8 rounded"
                                />
                            )}
                            <div>
                                <h4 className="font-semibold">{team.team.name}</h4>
                                <p className="text-sm text-gray-400">{team.team.abbreviation}</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                setSelectedTeam(team.team.id);
                                loadTeamRoster(team.team.id);
                            }}
                            className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 rounded-md text-sm font-semibold"
                        >
                            View Roster
                        </button>
                    </div>
                ))}
            </div>

            {selectedTeam && teamRoster.length > 0 && (
                <div className="mt-6">
                    <h4 className="text-lg font-semibold mb-3 text-green-400">Team Roster</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {teamRoster.slice(0, 12).map(player => (
                            <div key={player.id} className="bg-gray-600 p-3 rounded">
                                <p className="font-semibold">{player.fullName}</p>
                                <p className="text-sm text-gray-400">{player.position?.abbreviation} - {player.jersey}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    const renderStandingsTab = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-green-400">NFL Standings</h3>
                <button 
                    onClick={loadStandings}
                    disabled={isLoading}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold disabled:opacity-50"
                >
                    {isLoading ? 'Loading...' : 'Refresh Standings'}
                </button>
            </div>
            
            {standings.map(conference => (
                <div key={conference.id} className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-lg font-semibold mb-3">{conference.name}</h4>
                    {conference.groups?.map(division => (
                        <div key={division.id} className="mb-4">
                            <h5 className="font-semibold text-blue-400 mb-2">{division.name}</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                                {division.standings?.map(team => (
                                    <div key={team.team.id} className="bg-gray-600 p-2 rounded text-sm">
                                        <p className="font-semibold">{team.team.name}</p>
                                        <p className="text-gray-400">
                                            {team.stats?.find(s => s.name === 'wins')?.value || 0}-
                                            {team.stats?.find(s => s.name === 'losses')?.value || 0}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );

    const renderScoresTab = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-purple-400">NFL Scores</h3>
                <button 
                    onClick={loadScores}
                    disabled={isLoading}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-semibold disabled:opacity-50"
                >
                    {isLoading ? 'Loading...' : 'Refresh Scores'}
                </button>
            </div>
            
            <div className="space-y-3">
                {scores.map(game => (
                    <div key={game.id} className="bg-gray-700 p-4 rounded-lg">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-gray-400">{game.status?.type?.description}</span>
                                <span className="text-sm text-gray-400">{game.date}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{game.competitions[0]?.competitors[0]?.team?.name}</span>
                                <span className="text-lg font-bold">{game.competitions[0]?.competitors[0]?.score}</span>
                            </div>
                            <span className="text-gray-400">vs</span>
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-bold">{game.competitions[0]?.competitors[1]?.score}</span>
                                <span className="font-semibold">{game.competitions[0]?.competitors[1]?.team?.name}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderSearchTab = () => (
        <div className="space-y-4">
            <h3 className="text-xl font-semibold text-yellow-400">Player Search</h3>
            
            <div className="flex gap-2">
                <input 
                    type="text"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Search for a player..."
                    className="flex-1 p-2 rounded-md bg-gray-600 text-white border border-gray-500"
                    onKeyPress={(e) => e.key === 'Enter' && searchPlayers()}
                />
                <button 
                    onClick={searchPlayers}
                    disabled={isLoading || !playerSearch.trim()}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-md font-semibold disabled:opacity-50"
                >
                    {isLoading ? 'Searching...' : 'Search'}
                </button>
            </div>
            
            {searchResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {searchResults.map(player => (
                        <div key={player.id} className="bg-gray-600 p-3 rounded">
                            <p className="font-semibold">{player.fullName}</p>
                            <p className="text-sm text-gray-400">{player.position?.abbreviation} - {player.team?.name}</p>
                            {player.jersey && <p className="text-sm text-gray-400">#{player.jersey}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="p-6 bg-gray-800 rounded-lg shadow-xl max-w-7xl mx-auto my-8 text-white">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">ESPN NFL API Integration</h2>
            
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-600 mb-6">
                <button 
                    onClick={() => setActiveTab('teams')} 
                    className={`px-4 py-3 font-semibold ${activeTab === 'teams' ? 'border-b-2 border-blue-400 text-white' : 'text-gray-400'}`}
                >
                    Teams & Rosters
                </button>
                <button 
                    onClick={() => setActiveTab('standings')} 
                    className={`px-4 py-3 font-semibold ${activeTab === 'standings' ? 'border-b-2 border-green-400 text-white' : 'text-gray-400'}`}
                >
                    Standings
                </button>
                <button 
                    onClick={() => setActiveTab('scores')} 
                    className={`px-4 py-3 font-semibold ${activeTab === 'scores' ? 'border-b-2 border-purple-400 text-white' : 'text-gray-400'}`}
                >
                    Scores
                </button>
                <button 
                    onClick={() => setActiveTab('search')} 
                    className={`px-4 py-3 font-semibold ${activeTab === 'search' ? 'border-b-2 border-yellow-400 text-white' : 'text-gray-400'}`}
                >
                    Player Search
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'teams' && renderTeamsTab()}
            {activeTab === 'standings' && renderStandingsTab()}
            {activeTab === 'scores' && renderScoresTab()}
            {activeTab === 'search' && renderSearchTab()}

            {/* API Information */}
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500 rounded-lg">
                <h3 className="text-lg font-semibold mb-2 text-blue-400">ESPN API Features:</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                    <li>• <strong>Free to use</strong> - No API key required</li>
                    <li>• <strong>Real-time data</strong> - Live scores and stats</li>
                    <li>• <strong>Complete rosters</strong> - All NFL team players</li>
                    <li>• <strong>Standings</strong> - Current NFL standings</li>
                    <li>• <strong>Player search</strong> - Find any NFL player</li>
                    <li>• <strong>Team logos</strong> - Official team branding</li>
                </ul>
            </div>
        </div>
    );
};

// Export for use in main app
window.ESPNDemoComponent = ESPNDemoComponent; 