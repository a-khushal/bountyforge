use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Token, TokenAccount, Transfer};

use crate::errors::BountyForgeError;
use crate::state::{Bounty, BountyStatus, Reputation};

#[derive(Accounts)]
pub struct SettleBounty<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = bounty.status == BountyStatus::Submitted @ BountyForgeError::BountyNotSubmitted,
        constraint = bounty.solution_hash.is_some() @ BountyForgeError::BountyAlreadySubmitted,
        constraint = creator.key() == bounty.creator @ BountyForgeError::UnauthorizedSettlement
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        constraint = reputation.agent == agent.key() @ BountyForgeError::ReputationOwnerMismatch
    )]
    pub reputation: Account<'info, Reputation>,

    /// CHECK: Agent receiving the reward
    #[account(mut)]
    pub agent: AccountInfo<'info>,

    #[account(
        mut,
        constraint = agent_token_account.owner == agent.key(),
        constraint = agent_token_account.mint == usdc_mint.key()
    )]
    pub agent_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = bounty_token_account.owner == bounty.key(),
        constraint = bounty_token_account.mint == usdc_mint.key()
    )]
    pub bounty_token_account: Account<'info, TokenAccount>,

    /// CHECK: USDC mint address (validated by token accounts)
    pub usdc_mint: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> SettleBounty<'info> {
    pub fn settle_bounty(&mut self) -> Result<()> {
        // 1. transfering USDC from bounty PDA to agent token account
        let bounty_id_bytes = self.bounty.id.to_le_bytes();
        let bounty_seeds = &[b"bounty", bounty_id_bytes.as_ref(), &[self.bounty.bump]];
        let bounty_signer = &[&bounty_seeds[..]];

        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: self.bounty_token_account.to_account_info(),
            to: self.agent_token_account.to_account_info(),
            authority: self.bounty.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, bounty_signer);

        transfer(cpi_ctx, self.bounty.reward)?;

        // 2. updating reputation
        self.reputation.successful_bounties = self
            .reputation
            .successful_bounties
            .checked_add(1)
            .ok_or(BountyForgeError::ReputationOverflow)?;

        self.reputation.total_earned = self
            .reputation
            .total_earned
            .checked_add(self.bounty.reward)
            .ok_or(BountyForgeError::ReputationOverflow)?;

        // 3. updating bounty status
        self.bounty.status = BountyStatus::Settled;

        Ok(())
    }
}
