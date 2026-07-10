import requests
import json
import random
import sys
from datetime import datetime, timedelta

class DraftEngine:
    def __init__(self):
        self.espn_base_url = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl"
        
    def fetch_player_data(self, limit=100):
        """Fetch player data from ESPN API"""
        try:
            url = f"{self.espn_base_url}/athletes?limit={limit}&active=true"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            players = []
            if 'items' in data:
                for item in data['items']:
                    player = {
                        'id': item.get('id'),
                        'name': item.get('displayName', 'Unknown'),
                        'position': item.get('position', {}).get('abbreviation', 'N/A'),
                        'team': item.get('team', {}).get('displayName', 'Free Agent'),
                        'projected_points': random.randint(50, 300),  # Mock projection
                        'risk_factor': random.uniform(0.1, 0.9),  # Mock risk
                        'value_score': random.randint(1, 100)  # Mock value
                    }
                    players.append(player)
            
            return players
        except Exception as e:
            print(f"Error fetching player data: {e}")
            return []
    
    def calculate_optimal_pick(self, available_players, team_needs):
        """Calculate optimal pick based on available players and team needs"""
        if not available_players:
            return None
            
        # Simple algorithm: prioritize by position need and value score
        best_pick = None
        best_score = 0
        
        for player in available_players:
            position = player.get('position', 'N/A')
            value_score = player.get('value_score', 0)
            
            # Check if position is needed
            position_need = team_needs.get(position, 0)
            
            # Calculate pick score
            pick_score = value_score * (1 + position_need * 0.5)
            
            if pick_score > best_score:
                best_score = pick_score
                best_pick = player
        
        return best_pick
    
    def generate_draft_order(self, teams=None, draft_type='snake', team_count=None):
        """Generate draft order from team list or team count."""
        count = len(teams) if teams else (team_count or 0)
        if count <= 0:
            return []
        order = list(range(count))
        random.shuffle(order)
        return order

    def analyze_draft_strategy(self, league_settings, team_data):
        """Analyze draft strategy for a team"""
        return {
            'recommended_positions': ['QB', 'RB', 'WR', 'TE'],
            'avoid_positions': ['K', 'DEF'],
            'draft_strategy': 'balanced',
            'risk_tolerance': 'medium',
            'projected_finish': 'middle',
            'strategy': 'Best Player Available',
        }

    def process_draft_pick(self, league_id=None, team_id=None, player_id=None, draft_state=None, pick_data=None):
        """Process a draft pick"""
        payload = pick_data or {
            'league_id': league_id,
            'team_id': team_id,
            'player_id': player_id,
            'draft_state': draft_state or {},
        }
        return {
            'success': True,
            'pick_number': payload.get('pick_number', 1),
            'player': payload.get('player') or payload.get('player_id'),
            'timestamp': datetime.now().isoformat(),
            'draft_state': payload.get('draft_state', {}),
        }


def _dispatch_cli():
    """Read JSON from stdin, invoke a DraftEngine method, write JSON to stdout."""
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    function_name = payload.get('function')
    args = payload.get('args', {})

    engine = DraftEngine()
    if not function_name or not hasattr(engine, function_name):
        raise ValueError(f'Unknown draft engine function: {function_name}')

    method = getattr(engine, function_name)
    result = method(**args)
    print(json.dumps(result))


if __name__ == "__main__":
    if not sys.stdin.isatty():
        _dispatch_cli()
    else:
        engine = DraftEngine()
        players = engine.fetch_player_data(10)
        print(f"Fetched {len(players)} players")

        if players:
            optimal = engine.calculate_optimal_pick(players, {'QB': 1, 'RB': 2})
            print(f"Optimal pick: {optimal['name'] if optimal else 'None'}") 