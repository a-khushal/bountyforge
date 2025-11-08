import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupTestContext,
  getAssociatedTokenAddressSync,
  deriveReputationPda,
  airdropSol,
  createAgentTokenAccount,
  ensureCreatorBalance,
  postBounty,
  createAttestation,
  submitSolution,
  generateRandomId,
  generateSolutionHashWithValue,
  TestContext,
} from "./helpers";

describe("integration", () => {
  let ctx: TestContext;
  let creator: Keypair;
  let agent: Keypair;
  let agentTokenAccount: anchor.web3.PublicKey;

  before(async () => {
    ctx = await setupTestContext();
    creator = ctx.creator;

    agent = Keypair.generate();
    await airdropSol(ctx.connection, agent.publicKey);
    agentTokenAccount = await createAgentTokenAccount(
      ctx.connection,
      agent,
      ctx.usdcMint
    );
  });

  it("Complete bounty flow: post -> attest -> submit -> settle", async () => {
    await ensureCreatorBalance(
      ctx.connection,
      creator,
      ctx.usdcMint,
      ctx.creatorTokenAccount,
      200 * 10 ** 6
    );

    const bountyId = generateRandomId();
    const reward = 150 * 10 ** 6;
    const description = "Solve this complex problem";

    const bountyPda = await postBounty(ctx, bountyId, description, reward);

    const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.id.toNumber()).to.equal(bountyId);
    expect(bountyAccount.description).to.equal(description);
    expect(bountyAccount.reward.toNumber()).to.equal(reward);
    expect(bountyAccount.status).to.deep.equal({ open: {} });
    expect(bountyAccount.creator.toString()).to.equal(creator.publicKey.toString());

    const bountyTokenAccount = getAssociatedTokenAddressSync(
      ctx.usdcMint,
      bountyPda
    );
    const bountyBalance = await ctx.connection.getTokenAccountBalance(
      bountyTokenAccount
    );
    expect(bountyBalance.value.amount).to.equal(reward.toString());

    const solutionId = generateRandomId();
    const solutionHash = generateSolutionHashWithValue(0x42);

    const attestationPda = await createAttestation(
      ctx,
      agent,
      solutionId,
      solutionHash
    );

    const attestationAccount = await ctx.program.account.attestation.fetch(
      attestationPda
    );
    expect(attestationAccount.solutionId.toNumber()).to.equal(solutionId);
    expect(Buffer.from(attestationAccount.solutionHash)).to.deep.equal(
      solutionHash
    );
    expect(attestationAccount.agent.toString()).to.equal(
      agent.publicKey.toString()
    );
    expect(attestationAccount.verified).to.be.false;

    const [reputationPda] = deriveReputationPda(
      ctx.program.programId,
      agent.publicKey
    );

    await submitSolution(ctx, agent, bountyPda, attestationPda, solutionHash);

    const bountyAccountAfterSubmit = await ctx.program.account.bounty.fetch(
      bountyPda
    );
    expect(bountyAccountAfterSubmit.status).to.deep.equal({ submitted: {} });
    expect(Buffer.from(bountyAccountAfterSubmit.solutionHash)).to.deep.equal(
      solutionHash
    );

    const reputationAfterSubmit = await ctx.program.account.reputation.fetch(
      reputationPda
    );
    expect(reputationAfterSubmit.agent.toString()).to.equal(
      agent.publicKey.toString()
    );
    expect(reputationAfterSubmit.score.toNumber()).to.equal(1);
    expect(reputationAfterSubmit.successfulBounties.toNumber()).to.equal(0);
    expect(reputationAfterSubmit.totalEarned.toNumber()).to.equal(0);

    const agentBalanceBefore = await ctx.connection.getTokenAccountBalance(
      agentTokenAccount
    );

    await ctx.program.methods
      .settleBounty()
      .accountsPartial({
        creator: creator.publicKey,
        bounty: bountyPda,
        reputation: reputationPda,
        agent: agent.publicKey,
        agentTokenAccount: agentTokenAccount,
        bountyTokenAccount: bountyTokenAccount,
        usdcMint: ctx.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const bountyAccountAfterSettle = await ctx.program.account.bounty.fetch(
      bountyPda
    );
    expect(bountyAccountAfterSettle.status).to.deep.equal({ settled: {} });

    const bountyBalanceAfter = await ctx.connection.getTokenAccountBalance(
      bountyTokenAccount
    );
    expect(bountyBalanceAfter.value.amount).to.equal("0");

    const agentBalanceAfter = await ctx.connection.getTokenAccountBalance(
      agentTokenAccount
    );
    expect(agentBalanceAfter.value.amount).to.equal(
      (Number(agentBalanceBefore.value.amount) + reward).toString()
    );

    const reputationAfterSettle = await ctx.program.account.reputation.fetch(
      reputationPda
    );
    expect(reputationAfterSettle.successfulBounties.toNumber()).to.equal(1);
    expect(reputationAfterSettle.totalEarned.toNumber()).to.equal(reward);
    expect(reputationAfterSettle.score.toNumber()).to.equal(1);
  });

  it("Fails when trying to bypass required steps in bounty flow", async () => {
    await ensureCreatorBalance(
      ctx.connection,
      creator,
      ctx.usdcMint,
      ctx.creatorTokenAccount,
      200 * 10 ** 6
    );

    const bountyId = generateRandomId();
    const reward = 100 * 10 ** 6;
    const bountyPda = await postBounty(
      ctx,
      bountyId,
      "Test bounty for negative flow",
      reward
    );

    const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.status).to.deep.equal({ open: {} });

    const bountyTokenAccount = getAssociatedTokenAddressSync(
      ctx.usdcMint,
      bountyPda
    );

    const [reputationPda] = deriveReputationPda(
      ctx.program.programId,
      agent.publicKey
    );

    try {
      await ctx.program.methods
        .settleBounty()
        .accountsPartial({
          creator: creator.publicKey,
          bounty: bountyPda,
          reputation: reputationPda,
          agent: agent.publicKey,
          agentTokenAccount: agentTokenAccount,
          bountyTokenAccount: bountyTokenAccount,
          usdcMint: ctx.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      expect.fail("Should have failed - cannot settle bounty that hasn't been submitted");
    } catch (err) {
      expect(err).to.exist;
    }

    const solutionId = generateRandomId();
    const solutionHash = generateSolutionHashWithValue(0x99);
    const wrongSolutionHash = generateSolutionHashWithValue(0x88);

    const attestationPda = await createAttestation(
      ctx,
      agent,
      solutionId,
      solutionHash
    );

    try {
      await submitSolution(
        ctx,
        agent,
        bountyPda,
        attestationPda,
        wrongSolutionHash
      );

      expect.fail("Should have failed - solution hash doesn't match attestation");
    } catch (err) {
      expect(err).to.exist;
    }

    const differentAgent = Keypair.generate();
    await airdropSol(ctx.connection, differentAgent.publicKey);

    const solutionId2 = generateRandomId();
    const solutionHash2 = generateSolutionHashWithValue(0x77);
    const attestationPda2 = await createAttestation(
      ctx,
      differentAgent,
      solutionId2,
      solutionHash2
    );

    try {
      await submitSolution(
        ctx,
        agent,
        bountyPda,
        attestationPda2,
        solutionHash2
      );

      expect.fail("Should have failed - attestation doesn't belong to submitting agent");
    } catch (err) {
      expect(err).to.exist;
    }

    await submitSolution(ctx, agent, bountyPda, attestationPda, solutionHash);

    const wrongCreator = Keypair.generate();
    await airdropSol(ctx.connection, wrongCreator.publicKey);

    try {
      await ctx.program.methods
        .settleBounty()
        .accountsPartial({
          creator: wrongCreator.publicKey,
          bounty: bountyPda,
          reputation: reputationPda,
          agent: agent.publicKey,
          agentTokenAccount: agentTokenAccount,
          bountyTokenAccount: bountyTokenAccount,
          usdcMint: ctx.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([wrongCreator])
        .rpc();

      expect.fail("Should have failed - only creator can settle bounty");
    } catch (err) {
      expect(err).to.exist;
    }

    const bountyAccountFinal = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccountFinal.status).to.deep.equal({ submitted: {} });
  });
});

