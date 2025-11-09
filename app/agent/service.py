import json
import time
import os
import asyncio
import subprocess
import threading
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
from agent import BountyAgent

LOG_FILE = Path(__file__).parent / "logs" / "agent.log"
LOG_FILE.parent.mkdir(exist_ok=True)

class AgentService:
    def __init__(self):
        self.agent: Optional[BountyAgent] = None
        self.is_running = False
        self.current_bounties: List[Dict] = []
        self.log_buffer: List[Dict] = []
        self.wallet_address: Optional[str] = None
        self.signing_address: Optional[str] = None
        
    def write_log(self, level: str, message: str):
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message
        }
        self.log_buffer.append(log_entry)
        
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(log_entry) + "\n")
        
        if len(self.log_buffer) > 1000:
            self.log_buffer = self.log_buffer[-500:]
    
    def start_agent(self, single_run: bool = False):
        if self.is_running:
            return {"status": "already_running", "message": "Agent is already running"}
        
        self.is_running = True
        self.write_log("info", "Agent service started")
        
        def run_agent():
            try:
                agent = BountyAgent()
                self.agent = agent
                
                wallet_address = agent.wallet.get_address()
                signing_address = agent.wallet.get_signing_address()
                if wallet_address:
                    self.wallet_address = wallet_address
                    self.write_log("info", f"CDP Wallet address: {wallet_address}")
                if signing_address:
                    self.signing_address = signing_address
                    self.write_log("info", f"Signing keypair address: {signing_address}")
                    self.write_log("info", f"Fund signing address with SOL for transaction fees!")
                
                if single_run:
                    self.write_log("info", "Running single scan cycle")
                    self._run_single_cycle(agent)
                else:
                    self.write_log("info", "Starting continuous scan loop")
                    agent.scan_loop(interval_seconds=300)
            except Exception as e:
                self.write_log("error", f"Agent error: {str(e)}")
            finally:
                self.is_running = False
                self.write_log("info", "Agent service stopped")
        
        thread = threading.Thread(target=run_agent, daemon=True)
        thread.start()
        
        return {"status": "started", "message": "Agent started successfully"}
    
    def _run_single_cycle(self, agent: BountyAgent):
        try:
            self.write_log("info", "Scanning for bounties...")
            bounties = agent.discover_bounties()
            self.current_bounties = bounties
            
            if bounties:
                self.write_log("success", f"Discovered {len(bounties)} eligible bounties")
                for bounty in bounties:
                    self.write_log("info", f"Bounty #{bounty.get('id')}: {bounty.get('description', '')[:60]}...")
                
                selected = agent.select_bounty(bounties)
                if selected:
                    self.write_log("info", f"Selected Bounty #{selected.get('id')}")
                    
                    reason_result = agent.mcp.reason(selected.get('description', ''))
                    if reason_result:
                        self.write_log("info", f"Reasoning: {reason_result.get('reasoning')}")
                        needs = reason_result.get('needs', [])
                        
                        if 'switchboard_oracle' in needs:
                            self.write_log("info", "Paying for Switchboard oracle access...")
                            price_data = agent.x402.pay_for_switchboard(0.01)
                            if price_data:
                                self.write_log("success", f"Received price data: {price_data}")
                        elif 'code_analysis' in needs:
                            self.write_log("info", "Paying for LLM code analysis...")
                            llm_result = agent.x402.pay_for_llm(0.01)
                            if llm_result:
                                self.write_log("success", f"LLM analysis: {llm_result}")
                        elif 'data_analysis' in needs:
                            self.write_log("info", "Paying for data API access...")
                            data_result = agent.x402.pay_for_data(0.01)
                            if data_result:
                                self.write_log("success", f"Data result: {data_result}")
                        
                        solution = agent.generate_solution(selected, reason_result, needs)
                        if solution:
                            self.write_log("info", f"Generated solution: {solution[:100]}...")
                            
                            solution_id = agent.contract.generate_solution_id()
                            solution_hash = agent.contract.hash_solution(solution).hex()
                            
                            self.write_log("info", f"Attesting solution (ID: {solution_id})...")
                            attestation = asyncio.run(agent.contract.attest_solution(solution_id, solution))
                            self.write_log("success", f"Attestation prepared: {attestation['solution_hash'][:16]}...")
                            
                            bounty_id = selected.get('id')
                            if bounty_id:
                                self.write_log("info", f"Submitting solution to bounty #{bounty_id}...")
                                submission = asyncio.run(agent.contract.submit_solution(
                                    bounty_id, 
                                    solution_id, 
                                    solution
                                ))
                                self.write_log("success", f"Submission prepared: {submission['solution_hash'][:16]}...")
                                self.write_log("success", "Solution submitted successfully!")
            else:
                self.write_log("info", "No eligible bounties found")
        except Exception as e:
            self.write_log("error", f"Error in scan cycle: {str(e)}")
    
    def stop_agent(self):
        if not self.is_running:
            return {"status": "not_running", "message": "Agent is not running"}
        
        self.is_running = False
        self.write_log("info", "Agent stop requested")
        return {"status": "stopped", "message": "Agent stop requested"}
    
    def get_logs(self, limit: int = 100) -> List[Dict]:
        if LOG_FILE.exists():
            logs = []
            with open(LOG_FILE, "r") as f:
                lines = f.readlines()
                for line in lines[-limit:]:
                    try:
                        logs.append(json.loads(line.strip()))
                    except:
                        pass
            return logs
        return self.log_buffer[-limit:]
    
    def get_bounties(self) -> List[Dict]:
        return self.current_bounties
    
    def get_status(self) -> Dict:
        return {
            "is_running": self.is_running,
            "bounties_count": len(self.current_bounties),
            "logs_count": len(self.log_buffer),
            "wallet_address": self.wallet_address
        }
    
    def get_wallet_address(self) -> Optional[str]:
        if self.agent and self.agent.wallet:
            address = self.agent.wallet.get_address()
            if address:
                self.wallet_address = address
            return address or self.wallet_address
        return self.wallet_address
    
    async def get_reputation(self, agent_address: str) -> Optional[Dict]:
        if not self.agent:
            return None
        return await self.agent.contract.get_reputation(agent_address)

service = AgentService()

