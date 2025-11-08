use anchor_lang::prelude::*;

use crate::{constants::ANCHOR_DISCRIMINATOR, state::Attestation};

#[derive(Accounts)]
#[instruction(solution_id : u64)]
pub struct AttestSolution<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        init,
        payer = agent,
        space = ANCHOR_DISCRIMINATOR + Attestation::INIT_SPACE,
        seeds = [b"attest", solution_id.to_le_bytes().as_ref()],
        bump
    )]
    pub attestation: Account<'info, Attestation>,

    pub system_program: Program<'info, System>,
}

impl<'info> AttestSolution<'info> {
    pub fn attest_solution(
        &mut self,
        solution_id: u64,
        solution_hash: [u8; 32],
        bumps: &AttestSolutionBumps,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        self.attestation.set_inner(Attestation {
            solution_id,
            solution_hash,
            timestamp: now,
            agent: self.agent.key(),
            verified: false,
            bump: bumps.attestation,
        });

        Ok(())
    }
}
