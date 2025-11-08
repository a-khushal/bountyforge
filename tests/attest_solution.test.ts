import * as anchor from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupTestContext,
  deriveAttestationPda,
  airdropSol,
  generateRandomId,
  generateSolutionHash,
  generateSolutionHashWithValue,
  TestContext,
} from "./helpers";

describe("attest_solution", () => {
  let ctx: TestContext;
  let agent: Keypair;
  let solutionId: number;
  let attestationPda: anchor.web3.PublicKey;
  let solutionHash: Buffer;

  before(async () => {
    ctx = await setupTestContext();
  });

  beforeEach(() => {
    agent = Keypair.generate();
    solutionId = generateRandomId();
    [attestationPda] = deriveAttestationPda(ctx.program.programId, solutionId);
    solutionHash = generateSolutionHash();
  });

  it("Creates an attestation successfully", async () => {
    await airdropSol(ctx.connection, agent.publicKey);

    const beforeTimestamp = Math.floor(Date.now() / 1000);

    await ctx.program.methods
      .attestSolution(new anchor.BN(solutionId), Array.from(solutionHash))
      .accountsPartial({
        agent: agent.publicKey,
        attestation: attestationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const afterTimestamp = Math.floor(Date.now() / 1000);

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

    const attestationTimestamp = attestationAccount.timestamp.toNumber();
    expect(attestationTimestamp).to.be.at.least(beforeTimestamp - 5);
    expect(attestationTimestamp).to.be.at.most(afterTimestamp + 5);
  });

  it("Fails when trying to create duplicate attestation with same solution_id", async () => {
    await airdropSol(ctx.connection, agent.publicKey);

    await ctx.program.methods
      .attestSolution(new anchor.BN(solutionId), Array.from(solutionHash))
      .accountsPartial({
        agent: agent.publicKey,
        attestation: attestationPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const differentHash = generateSolutionHash();

    try {
      await ctx.program.methods
        .attestSolution(
          new anchor.BN(solutionId),
          Array.from(differentHash)
        )
        .accountsPartial({
          agent: agent.publicKey,
          attestation: attestationPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      expect.fail("Should have failed - attestation already exists");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Allows different agents to create attestations with different solution_ids", async () => {
    const agent1 = Keypair.generate();
    const agent2 = Keypair.generate();
    const solutionId1 = 100;
    const solutionId2 = 200;

    await airdropSol(ctx.connection, agent1.publicKey);
    await airdropSol(ctx.connection, agent2.publicKey);

    const [attestationPda1] = deriveAttestationPda(
      ctx.program.programId,
      solutionId1
    );
    const [attestationPda2] = deriveAttestationPda(
      ctx.program.programId,
      solutionId2
    );

    const hash1 = generateSolutionHashWithValue(0x01);
    const hash2 = generateSolutionHashWithValue(0x02);

    await ctx.program.methods
      .attestSolution(new anchor.BN(solutionId1), Array.from(hash1))
      .accountsPartial({
        agent: agent1.publicKey,
        attestation: attestationPda1,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent1])
      .rpc();

    await ctx.program.methods
      .attestSolution(new anchor.BN(solutionId2), Array.from(hash2))
      .accountsPartial({
        agent: agent2.publicKey,
        attestation: attestationPda2,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent2])
      .rpc();

    const attestation1 = await ctx.program.account.attestation.fetch(
      attestationPda1
    );
    const attestation2 = await ctx.program.account.attestation.fetch(
      attestationPda2
    );

    expect(attestation1.solutionId.toNumber()).to.equal(solutionId1);
    expect(attestation2.solutionId.toNumber()).to.equal(solutionId2);
    expect(attestation1.agent.toString()).to.equal(agent1.publicKey.toString());
    expect(attestation2.agent.toString()).to.equal(agent2.publicKey.toString());
    expect(Buffer.from(attestation1.solutionHash)).to.deep.equal(hash1);
    expect(Buffer.from(attestation2.solutionHash)).to.deep.equal(hash2);
  });

  it("Allows same agent to create multiple attestations with different solution_ids", async () => {
    await airdropSol(ctx.connection, agent.publicKey);

    const solutionId1 = 300;
    const solutionId2 = 400;

    const [attestationPda1] = deriveAttestationPda(
      ctx.program.programId,
      solutionId1
    );
    const [attestationPda2] = deriveAttestationPda(
      ctx.program.programId,
      solutionId2
    );

    const hash1 = generateSolutionHashWithValue(0xaa);
    const hash2 = generateSolutionHashWithValue(0xbb);

    await ctx.program.methods
      .attestSolution(new anchor.BN(solutionId1), Array.from(hash1))
      .accountsPartial({
        agent: agent.publicKey,
        attestation: attestationPda1,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    await ctx.program.methods
      .attestSolution(new anchor.BN(solutionId2), Array.from(hash2))
      .accountsPartial({
        agent: agent.publicKey,
        attestation: attestationPda2,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();

    const attestation1 = await ctx.program.account.attestation.fetch(
      attestationPda1
    );
    const attestation2 = await ctx.program.account.attestation.fetch(
      attestationPda2
    );

    expect(attestation1.agent.toString()).to.equal(agent.publicKey.toString());
    expect(attestation2.agent.toString()).to.equal(agent.publicKey.toString());
    expect(attestation1.solutionId.toNumber()).to.equal(solutionId1);
    expect(attestation2.solutionId.toNumber()).to.equal(solutionId2);
  });
});

