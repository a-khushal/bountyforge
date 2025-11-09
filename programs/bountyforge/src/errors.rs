use anchor_lang::prelude::*;

#[error_code]
pub enum BountyForgeError {
    #[msg("Bounty is not in Open status")]
    BountyNotOpen,
    #[msg("Bounty already has a submitted solution")]
    BountyAlreadySubmitted,
    #[msg("Solution hash does not match attestation")]
    SolutionHashMismatch,
    #[msg("Attestation does not belong to submitting agent")]
    AttestationOwnerMismatch,
    #[msg("Reputation score overflow")]
    ReputationScoreOverflow,
    #[msg("Bounty is not in Submitted status")]
    BountyNotSubmitted,
    #[msg("Only the bounty creator can settle the bounty")]
    UnauthorizedSettlement,
    #[msg("Reputation does not belong to the agent")]
    ReputationOwnerMismatch,
    #[msg("Reputation arithmetic overflow")]
    ReputationOverflow,
    #[msg("Switchboard oracle verification failed")]
    OracleVerificationFailed,
    #[msg("Oracle data is stale")]
    OracleDataStale,
}
