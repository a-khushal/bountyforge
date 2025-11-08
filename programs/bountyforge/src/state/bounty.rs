use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bounty {
    pub id: u64,
    #[max_len(50)]
    pub description: String,
    pub reward: u64, // lamports
    pub solution_hash: Option<[u8; 32]>,
    pub status: BountyStatus,
    pub creator: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BountyStatus {
    Open,
    Submitted,
    Settled,
}
