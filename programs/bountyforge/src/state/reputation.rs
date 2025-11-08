use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Reputation {
    pub agent: Pubkey,
    pub score: u64, // +1 per successful bounty
    pub successful_bounties: u64,
    pub failed_bounties: u64,
    pub total_earned: u64, // lamports
    pub bump: u8,
}
