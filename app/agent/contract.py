import hashlib
from typing import Optional, Dict, List
from pathlib import Path
from solders.pubkey import Pubkey
from solders.keypair import Keypair as SoldersKeypair
from anchorpy import Program, Provider, Wallet, Idl
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
import os
import json


class BountyForgeClient:
    def __init__(self, program_id: str = "DUYYaLDvkWfFYKB8HshseMi6f5X9ShxaydsfrJLrkGMM", wallet_address: Optional[str] = None, wallet_keypair: Optional[SoldersKeypair] = None):
        self.program_id = program_id
        self.wallet_address = wallet_address
        self.wallet_keypair = wallet_keypair
        
    def hash_solution(self, solution: str) -> bytes:
        return hashlib.sha256(solution.encode()).digest()
    
    def generate_solution_id(self) -> int:
        import random
        return random.randint(1, 2**63 - 1)
    
    def prepare_attestation(self, solution_id: int, solution: str) -> Dict:
        solution_hash = self.hash_solution(solution)
        return {
            "solution_id": solution_id,
            "solution_hash": solution_hash.hex(),
            "solution": solution
        }
    
    def prepare_submission(self, bounty_id: int, solution_id: int, solution: str) -> Dict:
        solution_hash = self.hash_solution(solution)
        return {
            "bounty_id": bounty_id,
            "solution_id": solution_id,
            "solution_hash": solution_hash.hex(),
            "solution": solution
        }
    
    def _derive_attestation_pda(self, solution_id: int, program_id: Pubkey) -> tuple[Pubkey, int]:
        solution_id_buffer = solution_id.to_bytes(8, 'little')
        seeds = [b"attest", solution_id_buffer]
        return Pubkey.find_program_address_sync(seeds, program_id)
    
    def _derive_bounty_pda(self, bounty_id: int, program_id: Pubkey) -> tuple[Pubkey, int]:
        bounty_id_buffer = bounty_id.to_bytes(8, 'little')
        seeds = [b"bounty", bounty_id_buffer]
        return Pubkey.find_program_address_sync(seeds, program_id)
    
    def _derive_reputation_pda(self, agent_pubkey: Pubkey, program_id: Pubkey) -> tuple[Pubkey, int]:
        seeds = [b"rep", bytes(agent_pubkey)]
        return Pubkey.find_program_address_sync(seeds, program_id)
    
    async def _get_program_and_provider(self):
        rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
        client = AsyncClient(rpc_url)
        program_id = Pubkey.from_string(self.program_id)
        
        if not self.wallet_keypair:
            raise ValueError("Wallet keypair required for on-chain transactions. Set wallet_keypair in BountyForgeClient")
        
        wallet = Wallet(self.wallet_keypair)
        provider = Provider(client, wallet)
        
        idl_path = Path(__file__).parent.parent.parent / "target" / "idl" / "bountyforge.json"
        if not idl_path.exists():
            idl_path = Path.cwd() / "target" / "idl" / "bountyforge.json"
        if not idl_path.exists():
            idl_path = Path(__file__).parent.parent.parent.parent / "target" / "idl" / "bountyforge.json"
        
        # Try to load IDL from file first (faster and more reliable)
        if idl_path.exists():
            try:
                print(f"Loading IDL from file: {idl_path}")
                with open(idl_path, 'r') as f:
                    idl_json = f.read()
                # Convert JSON string to Idl object
                idl = Idl.from_json(idl_json)
                program = Program(idl, program_id, provider)
                print("IDL loaded successfully from file")
            except Exception as e:
                print(f"Failed to load IDL from file: {e}")
                print("Note: IDL parsing failed. This may be due to IDL format incompatibility.")
                # Fallback: try to fetch from chain
                try:
                    print("Trying to fetch IDL from chain...")
                    program = await Program.at(program_id, provider)
                    print("IDL fetched from chain")
                except Exception as e2:
                    print(f"Failed to fetch IDL from chain: {e2}")
                    print("Program may not be deployed. On-chain operations will be disabled.")
                    raise FileNotFoundError(f"IDL not available. Deploy program or fix IDL format.")
        else:
            # No local IDL file, try to fetch from chain
            try:
                print(f"IDL file not found at {idl_path}, fetching from chain...")
                program = await Program.at(program_id, provider)
                print("IDL fetched from chain")
            except Exception as e:
                print(f"Failed to fetch IDL from chain: {e}")
                print("Program may not be deployed. On-chain operations will be disabled.")
                raise FileNotFoundError(f"IDL not found. Run 'anchor build' to generate IDL at target/idl/bountyforge.json")
        
        return program, provider, client
    
    async def attest_solution(self, solution_id: int, solution: str) -> Dict:
        if not self.wallet_keypair:
            print("Wallet keypair not set, using mock attestation")
            return self.prepare_attestation(solution_id, solution)
        
        try:
            solution_hash = self.hash_solution(solution)
            program, provider, client = await self._get_program_and_provider()
            program_id = Pubkey.from_string(self.program_id)
            
            agent_pubkey = self.wallet_keypair.pubkey()
            attestation_pda, _ = self._derive_attestation_pda(solution_id, program_id)
            
            print(f"Attesting solution on-chain (ID: {solution_id})...")
            print(f"   Attestation PDA: {attestation_pda}")
            
            attest_method = getattr(program.methods, "attest_solution")
            tx = await attest_method(
                solution_id,
                list(solution_hash)
            ).accounts({
                "agent": agent_pubkey,
                "attestation": attestation_pda,
                "system_program": Pubkey.from_string("11111111111111111111111111111111")
            }).rpc(commitment="confirmed")
            
            print(f"Attestation submitted! Transaction: {tx}")
            
            return {
                "solution_id": solution_id,
                "solution_hash": solution_hash.hex(),
                "transaction": str(tx),
                "attestation_pda": str(attestation_pda)
            }
        except Exception as e:
            print(f"Error attesting solution on-chain: {e}")
            print("   Falling back to mock attestation")
            return self.prepare_attestation(solution_id, solution)
    
    async def submit_solution(self, bounty_id: int, solution_id: int, solution: str) -> Dict:
        if not self.wallet_keypair:
            print("Wallet keypair not set, using mock submission")
            return self.prepare_submission(bounty_id, solution_id, solution)
        
        try:
            solution_hash = self.hash_solution(solution)
            program, provider, client = await self._get_program_and_provider()
            program_id = Pubkey.from_string(self.program_id)
            
            agent_pubkey = self.wallet_keypair.pubkey()
            
            bounty_pda, _ = self._derive_bounty_pda(bounty_id, program_id)
            attestation_pda, _ = self._derive_attestation_pda(solution_id, program_id)
            reputation_pda, _ = self._derive_reputation_pda(agent_pubkey, program_id)
            
            print(f"Submitting solution on-chain (Bounty: {bounty_id}, Solution ID: {solution_id})...")
            print(f"   Bounty PDA: {bounty_pda}")
            print(f"   Attestation PDA: {attestation_pda}")
            print(f"   Reputation PDA: {reputation_pda}")
            
            accounts = {
                "agent": agent_pubkey,
                "bounty": bounty_pda,
                "attestation": attestation_pda,
                "reputation": reputation_pda,
                "system_program": Pubkey.from_string("11111111111111111111111111111111")
            }
            
            submit_method = getattr(program.methods, "submit_solution")
            tx = await submit_method(
                list(solution_hash)
            ).accounts(accounts).rpc(commitment="confirmed")
            
            print(f"Solution submitted on-chain! Transaction: {tx}")
            print(f"   Reputation PDA created/updated: {reputation_pda}")
            
            return {
                "bounty_id": bounty_id,
                "solution_id": solution_id,
                "solution_hash": solution_hash.hex(),
                "transaction": str(tx),
                "reputation_pda": str(reputation_pda)
            }
        except Exception as e:
            print(f"Error submitting solution on-chain: {e}")
            import traceback
            traceback.print_exc()
            print("   Falling back to mock submission")
            return self.prepare_submission(bounty_id, solution_id, solution)
    
    async def get_open_bounties(self) -> List[Dict]:
        try:            
            rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
            client = AsyncClient(rpc_url)
            
            program_id = Pubkey.from_string(self.program_id)
            provider = Provider(client, None)
            
            try:
                # Fetch IDL from chain
                program = await Program.at(program_id, provider)
                
                all_accounts = await client.get_program_accounts(
                    program_id,
                    commitment=Confirmed,
                    filters=[]
                )
                
                bounties = []
                for account_info in all_accounts.value:
                    try:
                        account_data = program.coder.accounts.decode("Bounty", account_info.account.data)
                        
                        if account_data.status == 0:
                            bounties.append({
                                "id": account_data.id,
                                "description": account_data.description,
                                "reward": account_data.reward,
                                "status": "open",
                                "creator": str(account_data.creator),
                                "on_chain": True
                            })
                    except Exception as e:
                        continue
                
                return bounties
            except Exception as e:
                print(f"Error fetching on-chain bounties: {e}")
                return []
        except Exception as e:
            print(f"Error initializing bounty query: {e}")
            return []
    
    async def get_reputation(self, agent_address: str) -> Optional[Dict]:
        try:
            from solders.pubkey import Pubkey
            from anchorpy import Program, Provider
            from solana.rpc.async_api import AsyncClient
            import os
            
            rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
            client = AsyncClient(rpc_url)
            
            program_id = Pubkey.from_string(self.program_id)
            provider = Provider(client, None)
            
            try:
                # Fetch IDL from chain
                program = await Program.at(program_id, provider)
                
                agent_pubkey = Pubkey.from_string(agent_address)
                seeds = [b"rep", bytes(agent_pubkey)]
                rep_pda, _ = Pubkey.find_program_address(seeds, program_id)
                
                account_info = await client.get_account_info(rep_pda)
                
                if account_info.value is None:
                    print(f"Reputation PDA not found on-chain for {agent_address}")
                    print(f"   PDA: {rep_pda}")
                    print(f"   This is expected if no solutions have been submitted on-chain yet")
                    return {
                        "score": 0,
                        "successful_bounties": 0,
                        "failed_bounties": 0,
                        "total_earned": 0
                    }
                
                rep_data = program.coder.accounts.decode("Reputation", account_info.value.data)
                
                return {
                    "score": rep_data.score,
                    "successful_bounties": rep_data.successful_bounties,
                    "failed_bounties": rep_data.failed_bounties,
                    "total_earned": rep_data.total_earned
                }
            except Exception as e:
                print(f"Error fetching reputation: {e}")
                return {
                    "score": 0,
                    "successful_bounties": 0,
                    "failed_bounties": 0,
                    "total_earned": 0
                }
        except Exception as e:
            print(f"Error initializing reputation query: {e}")
            return None

