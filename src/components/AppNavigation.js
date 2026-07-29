import React from 'react';

const LEAGUE_TABS = [
    { id: 'leagues', label: 'My Leagues', shortLabel: 'Leagues' },
    { id: 'roster', label: 'Roster', shortLabel: 'Roster' },
    { id: 'draft-center', label: 'Draft Center', shortLabel: 'Draft' },
    { id: 'waiver-wire', label: 'Waiver Wire', shortLabel: 'Waivers' },
    { id: 'trade', label: 'Trade', shortLabel: 'Trade' },
    { id: 'standings', label: 'Standings', shortLabel: 'Standings' },
    { id: 'live-scores', label: 'Live Scores', shortLabel: 'Scores' },
    { id: 'league-dues', label: 'League Dues', shortLabel: 'Dues' },
    { id: 'league-chat', label: 'League Chat', shortLabel: 'Chat' },
    { id: 'direct-messages', label: 'Messages', shortLabel: 'DMs' },
];

const ALWAYS_TABS = [
    { id: 'leagues', label: 'Select League', shortLabel: 'Leagues' },
];

const tabButtonClass = (isActive) => (
    `px-3 py-2 text-sm sm:text-base rounded-md font-semibold transition-colors whitespace-nowrap touch-target ${
        isActive
            ? 'bg-purple-800 text-white shadow-lg'
            : 'bg-emerald-900 text-emerald-200 hover:bg-emerald-800 active:bg-emerald-700'
    }`
);

const mobileTabButtonClass = (isActive) => (
    `flex-shrink-0 snap-start min-w-[4.5rem] px-2 py-2 text-xs font-semibold rounded-md transition-colors touch-target ${
        isActive
            ? 'bg-purple-800 text-white'
            : 'bg-emerald-900/80 text-emerald-200 active:bg-emerald-800'
    }`
);

const UnreadBadge = ({ count, compact = false }) => {
    if (!count) return null;
    return (
        <span
            className={
                compact
                    ? 'ml-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white'
                    : 'ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white'
            }
            aria-label={`${count} unread notifications`}
        >
            {count > 9 ? '9+' : count}
        </span>
    );
};

export const AppNavigation = ({
    activeTab,
    setActiveTab,
    showLeagueTabs,
    isCommissioner,
    unreadTradeCount = 0,
    unreadChatCount = 0,
    unreadDmCount = 0,
}) => {
    const unreadByTab = {
        trade: unreadTradeCount,
        'league-chat': unreadChatCount,
        'direct-messages': unreadDmCount,
    };

    const tabs = showLeagueTabs
        ? [
            ...LEAGUE_TABS,
            ...(isCommissioner ? [{ id: 'commissioner', label: 'Commissioner', shortLabel: 'Commish' }] : []),
        ]
        : ALWAYS_TABS;

    return (
        <>
            {/* Desktop / tablet top navigation */}
            <nav className="hidden md:block mb-8 bg-emerald-950 p-2 rounded-lg shadow-md">
                <ul className="flex justify-center flex-wrap gap-2 sm:gap-x-4">
                    {tabs.map((tab) => (
                        <li key={tab.id}>
                            <button
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={tabButtonClass(activeTab === tab.id)}
                            >
                                {tab.label}
                                <UnreadBadge count={unreadByTab[tab.id] || 0} />
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* Mobile bottom navigation */}
            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-emerald-950/95 backdrop-blur-sm border-t border-emerald-800 mobile-safe-bottom"
                aria-label="Main navigation"
            >
                <ul className="flex gap-1 overflow-x-auto px-2 py-2 snap-x snap-mandatory scrollbar-hide">
                    {tabs.map((tab) => (
                        <li key={tab.id} className="snap-start">
                            <button
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={mobileTabButtonClass(activeTab === tab.id)}
                            >
                                {tab.shortLabel}
                                <UnreadBadge count={unreadByTab[tab.id] || 0} compact />
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>
        </>
    );
};

export default AppNavigation;
