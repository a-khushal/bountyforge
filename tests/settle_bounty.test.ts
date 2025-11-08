import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, mintTo } from "@solana/spl-token";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupTestContext,
  deriveBountyPda,
  deriveReputationPda,
  getAssociatedTokenAddressSync,
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

describe("settle_bounty", () => {
  let ctx: TestContext;
  let agent: Keypair;
  let testBountyId: number;
  let testBountyPda: anchor.web3.PublicKey;
  let testBountyTokenAccount: anchor.web3.PublicKey;
  let solutionId: number;
  let attestationPda: anchor.web3.PublicKey;
  let solutionHash: Buffer;
  let reputationPda: anchor.web3.PublicKey;
  let agentTokenAccount: anchor.web3.PublicKey;

  before(async () => {
    ctx = await setupTestContext();
  });

  beforeEach(async () => {
    agent = Keypair.generate();
    await airdropSol(ctx.connection, agent.publicKey);

    agentTokenAccount = await createAgentTokenAccount(
      ctx.connection,
      agent,
      ctx.usdcMint
    );

    await ensureCreatorBalance(
      ctx.connection,
      ctx.creator,
      ctx.usdcMint,
      ctx.creatorTokenAccount,
      200 * 10 ** 6
    );

    testBountyId = generateRandomId();
    testBountyPda = await postBounty(
      ctx,
      testBountyId,
      "Test bounty for settlement",
      100 * 10 ** 6
    );

    testBountyTokenAccount = getAssociatedTokenAddressSync(
      ctx.usdcMint,
      testBountyPda
    );

    solutionId = generateRandomId();
    solutionHash = generateSolutionHashWithValue(0xaa);
    attestationPda = await createAttestation(
      ctx,
      agent,
      solutionId,
      solutionHash
    );

    [reputationPda] = deriveReputationPda(
      ctx.program.programId,
      agent.publicKey
    );

    await submitSolution(
      ctx,
      agent,
      testBountyPda,
      attestationPda,
      solutionHash
    );
  });

  it("Settles a bounty successfully and transfers reward to agent", async () => {
    const reward = 100 * 10 ** 6;

    const bountyBalanceBefore = await ctx.connection.getTokenAccountBalance(
      testBountyTokenAccount
    );
    const agentBalanceBefore = await ctx.connection.getTokenAccountBalance(
      agentTokenAccount
    );

    const reputationBefore = await ctx.program.account.reputation.fetch(
      reputationPda
    );

    await ctx.program.methods
      .settleBounty()
      .accountsPartial({
        creator: ctx.creator.publicKey,
        bounty: testBountyPda,
        reputation: reputationPda,
        agent: agent.publicKey,
        agentTokenAccount: agentTokenAccount,
        bountyTokenAccount: testBountyTokenAccount,
        usdcMint: ctx.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.creator])
      .rpc();

    const bountyAccount = await ctx.program.account.bounty.fetch(testBountyPda);
    expect(bountyAccount.status).to.deep.equal({ settled: {} });

    const bountyBalanceAfter = await ctx.connection.getTokenAccountBalance(
      testBountyTokenAccount
    );
    const agentBalanceAfter = await ctx.connection.getTokenAccountBalance(
      agentTokenAccount
    );

    expect(bountyBalanceAfter.value.amount).to.equal("0");
    expect(agentBalanceAfter.value.amount).to.equal(
      (Number(agentBalanceBefore.value.amount) + reward).toString()
    );

    const reputationAfter = await ctx.program.account.reputation.fetch(
      reputationPda
    );
    expect(reputationAfter.successfulBounties.toNumber()).to.equal(
      reputationBefore.successfulBounties.toNumber() + 1
    );
    expect(reputationAfter.totalEarned.toNumber()).to.equal(
      reputationBefore.totalEarned.toNumber() + reward
    );
  });

  it("Fails when creator is not the bounty creator", async () => {
    const wrongCreator = Keypair.generate();
    await airdropSol(ctx.connection, wrongCreator.publicKey);

    try {
      await ctx.program.methods
        .settleBounty()
        .accountsPartial({
          creator: wrongCreator.publicKey,
          bounty: testBountyPda,
          reputation: reputationPda,
          agent: agent.publicKey,
          agentTokenAccount: agentTokenAccount,
          bountyTokenAccount: testBountyTokenAccount,
          usdcMint: ctx.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([wrongCreator])
        .rpc();

      expect.fail("Should have failed - unauthorized creator");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Fails when bounty is not in Submitted status", async () => {
    const bountyId2 = generateRandomId();
    const bountyPda2 = await postBounty(ctx, bountyId2, "Open bounty", 50 * 10 ** 6);

    try {
      await ctx.program.methods
        .settleBounty()
        .accountsPartial({
          creator: ctx.creator.publicKey,
          bounty: bountyPda2,
          reputation: reputationPda,
          agent: agent.publicKey,
          agentTokenAccount: agentTokenAccount,
          bountyTokenAccount: getAssociatedTokenAddressSync(
            ctx.usdcMint,
            bountyPda2
          ),
          usdcMint: ctx.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();

      expect.fail("Should have failed - bounty not in Submitted status");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Fails when trying to settle already settled bounty", async () => {
    await ctx.program.methods
      .settleBounty()
      .accountsPartial({
        creator: ctx.creator.publicKey,
        bounty: testBountyPda,
        reputation: reputationPda,
        agent: agent.publicKey,
        agentTokenAccount: agentTokenAccount,
        bountyTokenAccount: testBountyTokenAccount,
        usdcMint: ctx.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.creator])
      .rpc();

    try {
      await ctx.program.methods
        .settleBounty()
        .accountsPartial({
          creator: ctx.creator.publicKey,
          bounty: testBountyPda,
          reputation: reputationPda,
          agent: agent.publicKey,
          agentTokenAccount: agentTokenAccount,
          bountyTokenAccount: testBountyTokenAccount,
          usdcMint: ctx.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();

      expect.fail("Should have failed - bounty already settled");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Updates reputation correctly for multiple settlements", async () => {
    await ctx.program.methods
      .settleBounty()
      .accountsPartial({
        creator: ctx.creator.publicKey,
        bounty: testBountyPda,
        reputation: reputationPda,
        agent: agent.publicKey,
        agentTokenAccount: agentTokenAccount,
        bountyTokenAccount: testBountyTokenAccount,
        usdcMint: ctx.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.creator])
      .rpc();

    const bountyId2 = generateRandomId();
    const reward2 = 75 * 10 ** 6;
    const bountyPda2 = await postBounty(
      ctx,
      bountyId2,
      "Second bounty",
      reward2
    );

    const solutionId2 = generateRandomId();
    const solutionHash2 = generateSolutionHashWithValue(0xbb);
    const attestationPda2 = await createAttestation(
      ctx,
      agent,
      solutionId2,
      solutionHash2
    );

    await submitSolution(ctx, agent, bountyPda2, attestationPda2, solutionHash2);

    const reputationBefore = await ctx.program.account.reputation.fetch(
      reputationPda
    );

    await ctx.program.methods
      .settleBounty()
      .accountsPartial({
        creator: ctx.creator.publicKey,
        bounty: bountyPda2,
        reputation: reputationPda,
        agent: agent.publicKey,
        agentTokenAccount: agentTokenAccount,
        bountyTokenAccount: getAssociatedTokenAddressSync(
          ctx.usdcMint,
          bountyPda2
        ),
        usdcMint: ctx.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.creator])
      .rpc();

    const reputationAfter = await ctx.program.account.reputation.fetch(
      reputationPda
    );
    expect(reputationAfter.successfulBounties.toNumber()).to.equal(
      reputationBefore.successfulBounties.toNumber() + 1
    );
    expect(reputationAfter.totalEarned.toNumber()).to.equal(
      reputationBefore.totalEarned.toNumber() + reward2
    );
  });

  it("Fails when reputation doesn't belong to agent", async () => {
    const differentAgent = Keypair.generate();
    await airdropSol(ctx.connection, differentAgent.publicKey);

    const [wrongReputationPda] = deriveReputationPda(
      ctx.program.programId,
      differentAgent.publicKey
    );

    try {
      await ctx.program.methods
        .settleBounty()
        .accountsPartial({
          creator: ctx.creator.publicKey,
          bounty: testBountyPda,
          reputation: wrongReputationPda,
          agent: agent.publicKey,
          agentTokenAccount: agentTokenAccount,
          bountyTokenAccount: testBountyTokenAccount,
          usdcMint: ctx.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();

      expect.fail("Should have failed - reputation owner mismatch");
    } catch (err) {
      expect(err).to.exist;
    }
  });
});

