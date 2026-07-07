import React, { useMemo, useState } from 'react';
import { ELIGIBLE_POSITIONS } from '../utils/sleeperPlayerService.js';

const PlayerRow = ({ player, onPlayerSelect, selectLabel }) => {
    const team = player.nflTeam || player.team || 'FA';
    const fullName = [player.first_name, player.last_name].filter(Boolean).join(' ') || player.name || 'Unknown';

    return (
        <>
            {/* Mobile card layout */}
            <div className="md:hidden border-t border-emerald-800 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white truncate">{fullName}</p>
                    <p className="text-sm text-emerald-300">
                        {player.position} · {team}
                    </p>
                </div>
                {onPlayerSelect && (
                    <button
                        type="button"
                        onClick={() => onPlayerSelect(player)}
                        className="flex-shrink-0 px-4 py-2 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white rounded-md text-sm font-semibold touch-target"
                    >
                        {selectLabel || 'Select'}
                    </button>
                )}
            </div>

            {/* Desktop table row */}
            <tr className="hidden md:table-row border-t border-emerald-800 hover:bg-emerald-800/70">
                <td className="px-3 py-2 text-white">{player.first_name || '—'}</td>
                <td className="px-3 py-2 text-white">{player.last_name || '—'}</td>
                <td className="px-3 py-2 text-emerald-300">{team}</td>
                <td className="px-3 py-2 text-emerald-300">{player.position}</td>
                {onPlayerSelect && (
                    <td className="px-3 py-2 text-right">
                        <button
                            type="button"
                            onClick={() => onPlayerSelect(player)}
                            className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-md text-xs font-semibold touch-target"
                        >
                            {selectLabel || 'Select'}
                        </button>
                    </td>
                )}
            </tr>
        </>
    );
};

export const SleeperPlayerList = ({
    players = [],
    title = 'NFL Players',
    onPlayerSelect,
    selectLabel,
    maxHeight = '24rem',
    emptyMessage = 'No players found.',
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [positionFilter, setPositionFilter] = useState('ALL');
    const [teamFilter, setTeamFilter] = useState('ALL');

    const availableTeams = useMemo(() => {
        const teams = new Set(
            players.map((player) => player.nflTeam || player.team || 'FA')
        );
        return [...teams].sort((a, b) => {
            if (a === 'FA') return 1;
            if (b === 'FA') return -1;
            return a.localeCompare(b);
        });
    }, [players]);

    const filteredPlayers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return players.filter((player) => {
            const team = player.nflTeam || player.team || 'FA';
            const matchesPosition = positionFilter === 'ALL' || player.position === positionFilter;
            const matchesTeam = teamFilter === 'ALL' || team === teamFilter;
            if (!matchesPosition || !matchesTeam) return false;
            if (!query) return true;

            const firstName = (player.first_name || '').toLowerCase();
            const lastName = (player.last_name || '').toLowerCase();

            return firstName.includes(query)
                || lastName.includes(query)
                || `${firstName} ${lastName}`.includes(query);
        });
    }, [players, searchQuery, positionFilter, teamFilter]);

    const filterControls = (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full">
            <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="w-full p-3 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                autoComplete="off"
            />
            <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="w-full p-3 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500"
            >
                <option value="ALL">All Teams</option>
                {availableTeams.map((team) => (
                    <option key={team} value={team}>{team === 'FA' ? 'Free Agent (FA)' : team}</option>
                ))}
            </select>
            <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="w-full p-3 rounded-md bg-emerald-800 text-white border border-emerald-600 focus:border-purple-500 sm:col-span-2 lg:col-span-1"
            >
                <option value="ALL">All Positions</option>
                {ELIGIBLE_POSITIONS.map((position) => (
                    <option key={position} value={position}>{position}</option>
                ))}
            </select>
        </div>
    );

    return (
        <div className="bg-emerald-900 p-3 sm:p-4 rounded-lg border border-emerald-700">
            <div className="flex flex-col gap-3 mb-4">
                <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-emerald-200">{title}</h3>
                    <p className="text-sm text-emerald-300">
                        {filteredPlayers.length} of {players.length} players
                    </p>
                </div>
                {filterControls}
            </div>

            <div
                className="overflow-y-auto overflow-x-hidden rounded-md border border-emerald-700 -webkit-overflow-scrolling-touch"
                style={{ maxHeight }}
            >
                {filteredPlayers.length > 0 ? (
                    <>
                        <div className="md:hidden">
                            {filteredPlayers.map((player) => (
                                <PlayerRow
                                    key={player.id}
                                    player={player}
                                    onPlayerSelect={onPlayerSelect}
                                    selectLabel={selectLabel}
                                />
                            ))}
                        </div>

                        <table className="hidden md:table w-full text-sm">
                            <thead className="sticky top-0 bg-emerald-950 text-emerald-200">
                                <tr>
                                    <th className="text-left px-3 py-2 font-semibold">First Name</th>
                                    <th className="text-left px-3 py-2 font-semibold">Last Name</th>
                                    <th className="text-left px-3 py-2 font-semibold">Team</th>
                                    <th className="text-left px-3 py-2 font-semibold">Pos</th>
                                    {onPlayerSelect && (
                                        <th className="text-right px-3 py-2 font-semibold">Action</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPlayers.map((player) => (
                                    <PlayerRow
                                        key={player.id}
                                        player={player}
                                        onPlayerSelect={onPlayerSelect}
                                        selectLabel={selectLabel}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </>
                ) : (
                    <p className="px-3 py-8 text-center text-emerald-300">{emptyMessage}</p>
                )}
            </div>
        </div>
    );
};

export default SleeperPlayerList;
