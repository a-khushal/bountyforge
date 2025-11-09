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

    /// CHECK: Optional Switchboard oracle account for price verification
    /// Only required if bounty description mentions oracle/price
    /// This is a generic account info - verification happens off-chain
    pub oracle: Option<AccountInfo<'info>>,

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

        let description_lower = self.bounty.description.to_lowercase();
        let requires_oracle = description_lower.contains("oracle") 
            || description_lower.contains("switchboard") 
            || description_lower.contains("price");
        
        if requires_oracle {
            // Oracle verification: require oracle account to be provided
            // Full verification happens off-chain via x402 gateway
            // On-chain we just verify the account exists and is not empty
            require!(
                self.oracle.is_some(),
                BountyForgeError::OracleVerificationFailed
            );
            
            if let Some(ref oracle_account) = self.oracle {
                // Basic check: oracle account must exist and have data
                require!(
                    !oracle_account.data_is_empty(),
                    BountyForgeError::OracleVerificationFailed
                );
            }
        }

        // 3. updating bounty
        self.bounty.solution_hash = Some(solution_hash);
        self.bounty.status = BountyStatus::Submitted;

        // 4. updating reputation
        if self.reputation.agent == Pubkey::default() {
            // New reputation account - initialize it
            self.reputation.set_inner(Reputation {
                agent: self.agent.key(),
                score: 1,
                successful_bounties: 0,
                failed_bounties: 0,
                total_earned: 0,
                bump: bumps.reputation,
            });
        } else {
            require!(
                self.reputation.agent == self.agent.key(),
                BountyForgeError::ReputationOwnerMismatch
            );
            self.reputation.score = self
                .reputation
                .score
                .checked_add(1)
                .ok_or(BountyForgeError::ReputationScoreOverflow)?;
        }

        Ok(())
    }
}
