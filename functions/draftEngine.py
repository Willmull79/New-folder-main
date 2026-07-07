import requests
import json
import random
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
    
    def generate_draft_order(self, team_count):
        """Generate random draft order"""
        return list(range(1, team_count + 1))
    
    def analyze_draft_strategy(self, league_settings, team_data):
        """Analyze draft strategy for a team"""
        return {
            'recommended_positions': ['QB', 'RB', 'WR', 'TE'],
            'avoid_positions': ['K', 'DEF'],
            'strategy': 'Best Player Available',
            'risk_tolerance': 'Medium'
        }
    
    def process_draft_pick(self, pick_data):
        """Process a draft pick"""
        return {
            'success': True,
            'pick_number': pick_data.get('pick_number', 1),
            'player': pick_data.get('player'),
            'timestamp': datetime.now().isoformat()
        }

if __name__ == "__main__":
    # Test the draft engine
    engine = DraftEngine()
    players = engine.fetch_player_data(10)
    print(f"Fetched {len(players)} players")
    
    if players:
        optimal = engine.calculate_optimal_pick(players, {'QB': 1, 'RB': 2})
        print(f"Optimal pick: {optimal['name'] if optimal else 'None'}") 