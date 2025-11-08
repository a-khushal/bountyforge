use crate::constants::ANCHOR_DISCRIMINATOR;
use crate::state::{Bounty, BountyStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Token, TokenAccount, Transfer};

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct PostBounty<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = ANCHOR_DISCRIMINATOR + Bounty::INIT_SPACE,
        seeds = [b"bounty", bounty_id.to_le_bytes().as_ref()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,

    /// CHECK: USDC mint address (validated by token account)
    pub usdc_mint: AccountInfo<'info>,

    #[account(
        mut,
        constraint = creator_token_account.mint == usdc_mint.key(),
        constraint = creator_token_account.owner == creator.key()
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = bounty_token_account.mint == usdc_mint.key(),
        constraint = bounty_token_account.owner == bounty.key()
    )]
    pub bounty_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> PostBounty<'info> {
    pub fn post_bounty(
        &mut self,
        bounty_id: u64,
        description: String,
        reward: u64,
        bumps: &PostBountyBumps,
    ) -> Result<()> {
        // 1. init bounty account
        self.bounty.set_inner(Bounty {
            id: bounty_id,
            description,
            reward,
            solution_hash: None,
            status: BountyStatus::Open,
            creator: self.creator.key(),
            bump: bumps.bounty,
        });

        // 2. transfering USDC from creator to bounty PDA token account (escrow)
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: self.creator_token_account.to_account_info(),
            to: self.bounty_token_account.to_account_info(),
            authority: self.creator.to_account_info(),
        };

        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);

        transfer(cpi_context, reward)?;

        Ok(())
    }
}
