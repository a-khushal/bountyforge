use anchor_lang::prelude::*;

use crate::{
    constants::ANCHOR_DISCRIMINATOR,
    errors::BountyForgeError,
    state::{Attestation, Bounty, BountyStatus, Reputation},
};

#[derive(Accounts)]
pub struct SubmitSolution<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        constraint = bounty.status == BountyStatus::Open @ BountyForgeError::BountyNotOpen,
        constraint = bounty.solution_hash.is_none() @ BountyForgeError::BountyAlreadySubmitted
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        constraint = attestation.agent == agent.key() @ BountyForgeError::AttestationOwnerMismatch
    )]
    pub attestation: Account<'info, Attestation>,

    #[account(
        init_if_needed,
        payer = agent,
        space = ANCHOR_DISCRIMINATOR + Reputation::INIT_SPACE,
        seeds = [b"rep", agent.key().as_ref()],
        bump
    )]
    pub reputation: Account<'info, Reputation>,

    pub system_program: Program<'info, System>,
}

impl<'info> SubmitSolution<'info> {
    pub fn submit_solution(
        &mut self,
        solution_hash: [u8; 32],
        bumps: &SubmitSolutionBumps,
    ) -> Result<()> {
        // 1. validating attestation solution hash matches
        require!(
            self.attestation.solution_hash == solution_hash,
            BountyForgeError::SolutionHashMismatch
        );

        // 2. updating bounty
        self.bounty.solution_hash = Some(solution_hash);
        self.bounty.status = BountyStatus::Submitted;

        // 3. updating reputation
        if self.reputation.agent == Pubkey::default() {
            self.reputation.set_inner(Reputation {
                agent: self.agent.key(),
                score: 1,
                successful_bounties: 0,
                failed_bounties: 0,
                total_earned: 0,
                bump: bumps.reputation,
            });
        } else {
            self.reputation.score = self
                .reputation
                .score
                .checked_add(1)
                .ok_or(BountyForgeError::ReputationScoreOverflow)?;
        }

        Ok(())
    }
}
