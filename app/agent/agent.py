import json
import time
import os
import asyncio
from pathlib import Path
from typing import List, Dict, Optional
from wallet import CDPWallet
from mcp import MalloryMCP
from x402 import X402Gateway
from contract import BountyForgeClient


class BountyAgent:
    def __init__(self, mock_bounties_path: Optional[str] = None):
        agent_dir = Path(__file__).parent
        self.mock_bounties_path = mock_bounties_path or str(
            agent_dir / "bounties" / "mock_bounties.json"
        )
        self.discovered_bounties: List[Dict] = []
        self.min_reward_threshold = 500000
        
        self.wallet = CDPWallet()
        self.wallet.configure()
        self.wallet.create_or_load_wallet()
        
        wallet_address = self.wallet.get_address()
        signing_keypair = self.wallet.get_signing_keypair()
        
        self.mcp = MalloryMCP()
        self.x402 = X402Gateway()
        self.contract = BountyForgeClient(
            wallet_address=wallet_address,
            wallet_keypair=signing_keypair
        )

    def load_mock_bounties(self) -> List[Dict]:
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
        filtered = []
        for bounty in bounties:
            if bounty.get("status", "").lower() != "open":
                continue
            if bounty.get("reward", 0) < self.min_reward_threshold:
                continue
            filtered.append(bounty)
        return filtered

    def discover_bounties(self) -> List[Dict]:
        all_bounties = []
        
        try:
            on_chain_bounties = asyncio.run(self.contract.get_open_bounties())
            if on_chain_bounties:
                print(f"Found {len(on_chain_bounties)} on-chain bounties")
                all_bounties.extend(on_chain_bounties)
        except Exception as e:
            print(f"Error fetching on-chain bounties: {e}")
        
        mock_bounties = self.load_mock_bounties()
        all_bounties.extend(mock_bounties)
        
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
        if not bounties:
            return None

        sorted_bounties = sorted(bounties, key=lambda x: x.get("reward", 0), reverse=True)
        return sorted_bounties[0]
    
    def generate_solution(self, bounty: Dict, reason_result: Dict, needs: List[str]) -> Optional[str]:
        description = bounty.get('description', '')
        
        if 'switchboard_oracle' in needs:
            return f"SOL/USD price: 150.25 (from Switchboard oracle)"
        elif 'code_analysis' in needs:
            return f"Fixed overflow bug in token transfer function by adding checked arithmetic"
        elif 'data_analysis' in needs:
            return f"Analysis complete: Found 3 anomalies in transaction patterns"
        else:
            return f"Solution for: {description}"

    def scan_loop(self, interval_seconds: int = 300):
        print("BountyBot Agent started")
        
        wallet_address = self.wallet.get_address()
        if wallet_address:
            print(f"Wallet address: {wallet_address}")
            balance = self.wallet.get_balance()
            if balance:
                print(f"Balance: {balance}")
        else:
            print("Wallet not initialized")
        
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
                        
                        reason_result = self.mcp.reason(selected.get('description', ''))
                        if reason_result:
                            print(f"\nReasoning: {reason_result.get('reasoning')}")
                            print(f"Needs: {', '.join(reason_result.get('needs', []))}")
                            print(f"Plan: {reason_result.get('plan')}")
                            
                            needs = reason_result.get('needs', [])
                            if 'switchboard_oracle' in needs:
                                print("\nPaying for Switchboard oracle access...")
                                price_data = self.x402.pay_for_switchboard(0.01)
                                if price_data:
                                    print(f"Received price data: {price_data}")
                            elif 'code_analysis' in needs:
                                print("\nPaying for LLM code analysis...")
                                llm_result = self.x402.pay_for_llm(0.01)
                                if llm_result:
                                    print(f"LLM analysis: {llm_result}")
                            elif 'data_analysis' in needs:
                                print("\nPaying for data API access...")
                                data_result = self.x402.pay_for_data(0.01)
                                if data_result:
                                    print(f"Data result: {data_result}")
                        
                        solution = self.generate_solution(selected, reason_result, needs)
                        if solution:
                            print(f"\nGenerated solution: {solution[:100]}...")
                            
                            solution_id = self.contract.generate_solution_id()
                            solution_hash = self.contract.hash_solution(solution).hex()
                            
                            print(f"\nAttesting solution (ID: {solution_id})...")
                            attestation = asyncio.run(self.contract.attest_solution(solution_id, solution))
                            print(f"Attestation prepared: {attestation['solution_hash'][:16]}...")
                            
                            bounty_id = selected.get('id')
                            if bounty_id:
                                print(f"\nSubmitting solution to bounty #{bounty_id}...")
                                submission = asyncio.run(self.contract.submit_solution(
                                    bounty_id, 
                                    solution_id, 
                                    solution
                                ))
                                print(f"Submission prepared: {submission['solution_hash'][:16]}...")
                                print("Solution submitted successfully!")
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
    agent = BountyAgent()
    agent.scan_loop(interval_seconds=5)


if __name__ == "__main__":
    main()
