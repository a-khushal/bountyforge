#![allow(unexpected_cfgs, deprecated)]

use anchor_lang::prelude::*;
use instructions::*;
mod constants;
mod errors;
mod instructions;
mod state;
declare_id!("DUYYaLDvkWfFYKB8HshseMi6f5X9ShxaydsfrJLrkGMM");

#[program]
pub mod bountyforge {
    use super::*;

    pub fn post_bounty(
        ctx: Context<PostBounty>,
        bounty_id: u64,
        description: String,
        reward: u64,
    ) -> Result<()> {
        ctx.accounts
            .post_bounty(bounty_id, description, reward, &ctx.bumps)
    }

    pub fn attest_solution(
        ctx: Context<AttestSolution>,
        solution_id: u64,
        solution_hash: [u8; 32],
    ) -> Result<()> {
        ctx.accounts
            .attest_solution(solution_id, solution_hash, &ctx.bumps)
    }

    pub fn submit_solution(ctx: Context<SubmitSolution>, solution_hash: [u8; 32]) -> Result<()> {
        ctx.accounts.submit_solution(solution_hash, &ctx.bumps)
    }

    pub fn settle_bounty(ctx: Context<SettleBounty>) -> Result<()> {
        ctx.accounts.settle_bounty()
    }
}
