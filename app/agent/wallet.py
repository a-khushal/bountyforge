import os
import asyncio
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

try:
    from cdp import CdpClient
except ImportError:
    CdpClient = None

load_dotenv(Path(__file__).parent / ".env")

class CDPWallet:
    def __init__(self, api_key_id: Optional[str] = None, api_key_secret: Optional[str] = None, wallet_secret: Optional[str] = None):
        self.api_key_id = api_key_id or os.getenv("CDP_API_KEY_ID")
        self.api_key_secret = api_key_secret or os.getenv("CDP_API_KEY_SECRET")
        self.wallet_secret = wallet_secret or os.getenv("CDP_WALLET_SECRET")
        self.client = None
        self.wallet = None
        self._configured = False
        
    def configure(self) -> bool:
        if CdpClient is None:
            print("cdp-sdk not installed. Run: pip install cdp-sdk")
            return False
        
        try:
            if not self.api_key_id or not self.api_key_secret:
                print("CDP API credentials not found. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET in .env file")
                print("Get credentials from: https://portal.cdp.coinbase.com/projects/api-keys")
                return False
            
            self.client = CdpClient(
                api_key_id=self.api_key_id,
                api_key_secret=self.api_key_secret,
                wallet_secret=self.wallet_secret
            )
            self._configured = True
            print("CDP SDK configured successfully")
            return True
        except Exception as e:
            print(f"Error configuring CDP SDK: {e}")
            return False
    
    def create_or_load_wallet(self, wallet_id: Optional[str] = None) -> bool:
        if not self._configured:
            if not self.configure():
                return False
        
        if CdpClient is None:
            print("cdp-sdk not installed. Run: pip install cdp-sdk")
            return False
        
        try:
            if wallet_id:
                self.wallet = asyncio.run(self.client.solana.get_account(wallet_id))
                print(f"Loaded existing wallet: {wallet_id}")
            else:
                self.wallet = asyncio.run(self.client.solana.create_account())
                print("Wallet created")
                print(f"Wallet name: {self.wallet.name}")
                print(f"Public address: {self.wallet.address}")
            
            return True
        except Exception as e:
            print(f"Error creating/loading wallet: {e}")
            return False
    
    def get_address(self) -> Optional[str]:
        if self.wallet:
            return self.wallet.address
        return None
    
    def get_signing_address(self) -> Optional[str]:
        """Get the address of the signing keypair (for on-chain transactions)"""
        keypair = self.get_signing_keypair()
        if keypair:
            return str(keypair.pubkey())
        return None
    
    def get_balance(self) -> Optional[dict]:
        if not self.wallet or not self.client:
            return None
        try:
            balances = asyncio.run(self.client.solana.list_token_balances(self.wallet.address))
            return balances
        except Exception as e:
            print(f"Error getting balance: {e}")
            return None
    
    def get_signing_keypair(self) -> Optional['SoldersKeypair']:
        """
        Get or create a local keypair for signing transactions.
        CDP wallet doesn't expose private keys, so we create a separate keypair.
        This keypair needs to be funded separately for transaction fees.
        """
        try:
            from solders.keypair import Keypair as SoldersKeypair
            from pathlib import Path
            import json
            
            keypair_path = Path(__file__).parent / ".agent_keypair.json"
            
            if keypair_path.exists():
                with open(keypair_path, 'r') as f:
                    keypair_data = json.load(f)
                    secret_key = bytes(keypair_data)
                    if len(secret_key) != 64:
                        print(f"Invalid keypair file (got {len(secret_key)} bytes, expected 64). Creating new keypair...")
                        keypair_path.unlink()
                        keypair = SoldersKeypair()
                        with open(keypair_path, 'w') as f:
                            json.dump(list(keypair.secret()), f)
                        print(f"Created new signing keypair: {keypair.pubkey()}")
                        print(f"IMPORTANT: Fund this address with SOL for transaction fees!")
                        print(f"   Address: {keypair.pubkey()}")
                        return keypair
                    return SoldersKeypair.from_bytes(secret_key)
            else:
                keypair = SoldersKeypair()
                with open(keypair_path, 'w') as f:
                    json.dump(list(keypair.secret()), f)
                print(f"Created new signing keypair: {keypair.pubkey()}")
                print(f"IMPORTANT: Fund this address with SOL for transaction fees!")
                print(f"   Address: {keypair.pubkey()}")
                print(f"   Keypair saved to: {keypair_path}")
                return keypair
        except Exception as e:
            print(f"Error getting signing keypair: {e}")
            return None
