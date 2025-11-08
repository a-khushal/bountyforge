import * as anchor from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupTestContext,
  deriveReputationPda,
  airdropSol,
  postBounty,
  createAttestation,
  generateRandomId,
  generateSolutionHashWithValue,
  TestContext,
} from "./helpers";

describe("submit_solution", () => {
  let ctx: TestContext;
  let agent: Keypair;
  let testBountyId: number;
  let testBountyPda: anchor.web3.PublicKey;
  let solutionId: number;
  let attestationPda: anchor.web3.PublicKey;
  let solutionHash: Buffer;
  let reputationPda: anchor.web3.PublicKey;

  before(async () => {
    ctx = await setupTestContext();
  });

  beforeEach(async () => {
    agent = Keypair.generate();
    await airdropSol(ctx.connection, agent.publicKey);

    testBountyId = generateRandomId();
    testBountyPda = await postBounty(
      ctx,
      testBountyId,
      "Test bounty for submission",
      100 * 10 ** 6
    );

    solutionId = generateRandomId();
    solutionHash = generateSolutionHashWithValue(0xab);
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
  });

  it("Submits a solution successfully and updates bounty and reputation", async () => {
    await ctx.program.methods
      .submitSolution(Array.from(solutionHash))
      .accountsPartial({
        agent: agent.publicKey,
        bounty: testBountyPda,
        attestation: attestationPda,
        reputation: reputationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const bountyAccount = await ctx.program.account.bounty.fetch(testBountyPda);
    expect(bountyAccount.status).to.deep.equal({ submitted: {} });
    expect(Buffer.from(bountyAccount.solutionHash)).to.deep.equal(solutionHash);

    const reputationAccount = await ctx.program.account.reputation.fetch(
      reputationPda
    );
    expect(reputationAccount.agent.toString()).to.equal(
      agent.publicKey.toString()
    );
    expect(reputationAccount.score.toNumber()).to.equal(1);
    expect(reputationAccount.successfulBounties.toNumber()).to.equal(0);
    expect(reputationAccount.failedBounties.toNumber()).to.equal(0);
    expect(reputationAccount.totalEarned.toNumber()).to.equal(0);
  });

  it("Increments reputation score for existing reputation", async () => {
    await ctx.program.methods
      .submitSolution(Array.from(solutionHash))
      .accountsPartial({
        agent: agent.publicKey,
        bounty: testBountyPda,
        attestation: attestationPda,
        reputation: reputationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const bountyId2 = generateRandomId();
    const bountyPda2 = await postBounty(ctx, bountyId2, "Second bounty", 50 * 10 ** 6);

    const solutionId2 = generateRandomId();
    const solutionHash2 = generateSolutionHashWithValue(0xcd);
    const attestationPda2 = await createAttestation(
      ctx,
      agent,
      solutionId2,
      solutionHash2
    );

    await ctx.program.methods
      .submitSolution(Array.from(solutionHash2))
      .accountsPartial({
        agent: agent.publicKey,
        bounty: bountyPda2,
        attestation: attestationPda2,
        reputation: reputationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const reputationAccount = await ctx.program.account.reputation.fetch(
      reputationPda
    );
    expect(reputationAccount.score.toNumber()).to.equal(2);
  });

  it("Fails when bounty is not in Open status", async () => {
    await ctx.program.methods
      .submitSolution(Array.from(solutionHash))
      .accountsPartial({
        agent: agent.publicKey,
        bounty: testBountyPda,
        attestation: attestationPda,
        reputation: reputationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const solutionId2 = generateRandomId();
    const solutionHash2 = generateSolutionHashWithValue(0xef);
    const attestationPda2 = await createAttestation(
      ctx,
      agent,
      solutionId2,
      solutionHash2
    );

    try {
      await ctx.program.methods
        .submitSolution(Array.from(solutionHash2))
        .accountsPartial({
          agent: agent.publicKey,
          bounty: testBountyPda,
          attestation: attestationPda2,
          reputation: reputationPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      expect.fail("Should have failed - bounty already submitted");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Fails when solution hash doesn't match attestation", async () => {
    const wrongHash = generateSolutionHashWithValue(0xff);

    try {
      await ctx.program.methods
        .submitSolution(Array.from(wrongHash))
        .accountsPartial({
          agent: agent.publicKey,
          bounty: testBountyPda,
          attestation: attestationPda,
          reputation: reputationPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      expect.fail("Should have failed - solution hash mismatch");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Fails when attestation doesn't belong to agent", async () => {
    const differentAgent = Keypair.generate();
    await airdropSol(ctx.connection, differentAgent.publicKey);

    const solutionId2 = generateRandomId();
    const solutionHash2 = generateSolutionHashWithValue(0x11);
    const attestationPda2 = await createAttestation(
      ctx,
      differentAgent,
      solutionId2,
      solutionHash2
    );

    try {
      await ctx.program.methods
        .submitSolution(Array.from(solutionHash2))
        .accountsPartial({
          agent: agent.publicKey,
          bounty: testBountyPda,
          attestation: attestationPda2,
          reputation: reputationPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      expect.fail("Should have failed - attestation owner mismatch");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Allows different agents to submit solutions to different bounties", async () => {
    const agent2 = Keypair.generate();
    await airdropSol(ctx.connection, agent2.publicKey);

    const bountyId2 = generateRandomId();
    const bountyPda2 = await postBounty(ctx, bountyId2, "Second bounty", 75 * 10 ** 6);

    await ctx.program.methods
      .submitSolution(Array.from(solutionHash))
      .accountsPartial({
        agent: agent.publicKey,
        bounty: testBountyPda,
        attestation: attestationPda,
        reputation: reputationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const solutionId2 = generateRandomId();
    const solutionHash2 = generateSolutionHashWithValue(0x22);
    const attestationPda2 = await createAttestation(
      ctx,
      agent2,
      solutionId2,
      solutionHash2
    );

    const [reputationPda2] = deriveReputationPda(
      ctx.program.programId,
      agent2.publicKey
    );

    await ctx.program.methods
      .submitSolution(Array.from(solutionHash2))
      .accountsPartial({
        agent: agent2.publicKey,
        bounty: bountyPda2,
        attestation: attestationPda2,
        reputation: reputationPda2,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent2])
      .rpc();

    const bounty1 = await ctx.program.account.bounty.fetch(testBountyPda);
    const bounty2 = await ctx.program.account.bounty.fetch(bountyPda2);

    expect(bounty1.status).to.deep.equal({ submitted: {} });
    expect(bounty2.status).to.deep.equal({ submitted: {} });

    const rep1 = await ctx.program.account.reputation.fetch(reputationPda);
    const rep2 = await ctx.program.account.reputation.fetch(reputationPda2);

    expect(rep1.agent.toString()).to.equal(agent.publicKey.toString());
    expect(rep2.agent.toString()).to.equal(agent2.publicKey.toString());
    expect(rep1.score.toNumber()).to.equal(1);
    expect(rep2.score.toNumber()).to.equal(1);
  });
});

