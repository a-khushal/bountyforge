import json
import time
import os
from pathlib import Path
from typing import List, Dict, Optional


class BountyAgent:
    def __init__(self, mock_bounties_path: Optional[str] = None):
        """Initialize the agent with bounty sources"""
        agent_dir = Path(__file__).parent
        self.mock_bounties_path = mock_bounties_path or str(
            agent_dir / "bounties" / "mock_bounties.json"
        )
        self.discovered_bounties: List[Dict] = []
        self.min_reward_threshold = 500000

    def load_mock_bounties(self) -> List[Dict]:
        """Load bounties from mock JSON file"""
        try:
            with open(self.mock_bounties_path, 'r') as f:
                bounties = json.load(f)
            print(f"Loaded {len(bounties)} bounties from mock feed")
            return bounties
        except FileNotFoundError:
            print(f"Mock bounties file not found: {self.mock_bounties_path}")
            return []
        except json.JSONDecodeError as e:
            print(f"Error parsing mock bounties JSON: {e}")
            return []

    def filter_bounties(self, bounties: List[Dict]) -> List[Dict]:
        """Filter bounties by reward threshold and status"""
        filtered = []
        for bounty in bounties:
            if bounty.get("status", "").lower() != "open":
                continue
            if bounty.get("reward", 0) < self.min_reward_threshold:
                continue
            filtered.append(bounty)
        return filtered

    def discover_bounties(self) -> List[Dict]:
        """Discover bounties from all sources"""
        all_bounties = []
        
        # Mock JSON feed
        mock_bounties = self.load_mock_bounties()
        all_bounties.extend(mock_bounties)
        
        # TODO: On-chain Bounty PDAs
        # TODO: Dark Research API

        filtered = self.filter_bounties(all_bounties)
        
        seen_ids = set()
        unique_bounties = []
        for bounty in filtered:
            bounty_id = bounty.get("id")
            if bounty_id and bounty_id not in seen_ids:
                seen_ids.add(bounty_id)
                unique_bounties.append(bounty)
        
        return unique_bounties

    def select_bounty(self, bounties: List[Dict]) -> Optional[Dict]:
        """Select the highest-value relevant bounty"""
        if not bounties:
            return None

        sorted_bounties = sorted(bounties, key=lambda x: x.get("reward", 0), reverse=True)
        return sorted_bounties[0]

    def scan_loop(self, interval_seconds: int = 300):
        """Main scanning loop - polls for bounties every interval"""
        print("BountyBot Agent started")
        print(f"Scanning every {interval_seconds} seconds...")
        print(f"Minimum reward threshold: {self.min_reward_threshold} lamports\n")
        
        while True:
            try:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Scanning for bounties...")

                bounties = self.discover_bounties()
                
                if bounties:
                    print(f"Found {len(bounties)} eligible bounties")
                    for bounty in bounties:
                        print(f"  - Bounty #{bounty.get('id')}: {bounty.get('description', '')[:60]}...")
                        print(f"    Reward: {bounty.get('reward', 0)} lamports")
                    
                    selected = self.select_bounty(bounties)
                    if selected:
                        print(f"\nSelected Bounty #{selected.get('id')}")
                        print(f"   Description: {selected.get('description')}")
                        print(f"   Reward: {selected.get('reward')} lamports")
                        print(f"   Skills: {', '.join(selected.get('skills', []))}")
                        
                        # TODO: Reason via Mallory MCP
                        # TODO: Pay x402 for resources
                        # TODO: Generate solution
                        # TODO: Attest solution
                        # TODO: Submit to bounty
                else:
                    print("No eligible bounties found")
                
                print(f"\nWaiting {interval_seconds} seconds until next scan...\n")
                time.sleep(interval_seconds)
                
            except KeyboardInterrupt:
                print("\n\nAgent stopped by user")
                break
            except Exception as e:
                print(f"Error in scan loop: {e}")
                time.sleep(interval_seconds)


def main():
    """Entry point"""
    agent = BountyAgent()

    # Change to 300s for production
    agent.scan_loop(interval_seconds=5)


if __name__ == "__main__":
    main()

