use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub solution_id: u64,
    pub solution_hash: [u8; 32],
    pub timestamp: i64,
    pub agent: Pubkey,
    pub verified: bool,
    pub bump: u8,
}
