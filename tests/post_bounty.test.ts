import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
  setupTestContext,
  deriveBountyPda,
  getAssociatedTokenAddressSync,
  createBountyTokenAccount,
  TestContext,
} from "./helpers";

describe("post_bounty", () => {
  let ctx: TestContext;
  let bountyId: number;
  let bountyPda: anchor.web3.PublicKey;
  let bountyTokenAccount: anchor.web3.PublicKey;

  before(async () => {
    ctx = await setupTestContext();
  });

  beforeEach(() => {
    bountyId = Math.floor(Math.random() * 1000000);
    [bountyPda] = deriveBountyPda(ctx.program.programId, bountyId);
    bountyTokenAccount = getAssociatedTokenAddressSync(
      ctx.usdcMint,
      bountyPda
    );
  });

  it("Posts a bounty successfully", async () => {
    const description = "Solve this puzzle";
    const reward = 100 * 10 ** 6;

    const creatorBalanceBefore = await ctx.connection.getTokenAccountBalance(
      ctx.creatorTokenAccount
    );

    await createBountyTokenAccount(
      ctx.connection,
      ctx.creator,
      ctx.usdcMint,
      bountyPda
    );

    await ctx.program.methods
      .postBounty(
        new anchor.BN(bountyId),
        description,
        new anchor.BN(reward)
      )
      .accountsPartial({
        creator: ctx.creator.publicKey,
        bounty: bountyPda,
        usdcMint: ctx.usdcMint,
        creatorTokenAccount: ctx.creatorTokenAccount,
        bountyTokenAccount: bountyTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.creator])
      .rpc();

    const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.id.toNumber()).to.equal(bountyId);
    expect(bountyAccount.description).to.equal(description);
    expect(bountyAccount.reward.toNumber()).to.equal(reward);
    expect(bountyAccount.status).to.deep.equal({ open: {} });
    expect(bountyAccount.creator.toString()).to.equal(
      ctx.creator.publicKey.toString()
    );
    expect(bountyAccount.solutionHash).to.be.null;

    const creatorBalanceAfter = await ctx.connection.getTokenAccountBalance(
      ctx.creatorTokenAccount
    );
    const bountyBalance = await ctx.connection.getTokenAccountBalance(
      bountyTokenAccount
    );

    expect(creatorBalanceAfter.value.amount).to.equal(
      (Number(creatorBalanceBefore.value.amount) - reward).toString()
    );
    expect(bountyBalance.value.amount).to.equal(reward.toString());
  });

  it("Fails when creator has insufficient USDC", async () => {
    const reward = 10000 * 10 ** 6;

    try {
      await ctx.program.methods
        .postBounty(
          new anchor.BN(bountyId),
          "Expensive bounty",
          new anchor.BN(reward)
        )
        .accountsPartial({
          creator: ctx.creator.publicKey,
          bounty: bountyPda,
          usdcMint: ctx.usdcMint,
          creatorTokenAccount: ctx.creatorTokenAccount,
          bountyTokenAccount: bountyTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();

      expect.fail("Should have failed with insufficient balance");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Fails when token account mint doesn't match", async () => {
    const wrongMint = await createMint(
      ctx.connection,
      ctx.creator,
      ctx.creator.publicKey,
      null,
      6
    );

    const wrongTokenAccount = await getOrCreateAssociatedTokenAccount(
      ctx.connection,
      ctx.creator,
      wrongMint,
      ctx.creator.publicKey
    );

    try {
      await ctx.program.methods
        .postBounty(
          new anchor.BN(bountyId),
          "Test bounty",
          new anchor.BN(100 * 10 ** 6)
        )
        .accountsPartial({
          creator: ctx.creator.publicKey,
          bounty: bountyPda,
          usdcMint: ctx.usdcMint,
          creatorTokenAccount: wrongTokenAccount.address,
          bountyTokenAccount: bountyTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();

      expect.fail("Should have failed with mint mismatch");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Fails when bounty token account owner is wrong", async () => {
    const wrongBountyTokenAccount = await getOrCreateAssociatedTokenAccount(
      ctx.connection,
      ctx.creator,
      ctx.usdcMint,
      ctx.creator.publicKey
    );

    try {
      await ctx.program.methods
        .postBounty(
          new anchor.BN(bountyId),
          "Test bounty",
          new anchor.BN(100 * 10 ** 6)
        )
        .accountsPartial({
          creator: ctx.creator.publicKey,
          bounty: bountyPda,
          usdcMint: ctx.usdcMint,
          creatorTokenAccount: ctx.creatorTokenAccount,
          bountyTokenAccount: wrongBountyTokenAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();

      expect.fail("Should have failed with owner mismatch");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("Can post multiple bounties", async () => {
    const bountyId1 = 1;
    const bountyId2 = 2;
    const reward = 50 * 10 ** 6;

    const [bountyPda1] = deriveBountyPda(ctx.program.programId, bountyId1);
    const [bountyPda2] = deriveBountyPda(ctx.program.programId, bountyId2);

    const bountyTokenAccount1 = getAssociatedTokenAddressSync(
      ctx.usdcMint,
      bountyPda1
    );
    const bountyTokenAccount2 = getAssociatedTokenAddressSync(
      ctx.usdcMint,
      bountyPda2
    );

    await createBountyTokenAccount(
      ctx.connection,
      ctx.creator,
      ctx.usdcMint,
      bountyPda1
    );
    await createBountyTokenAccount(
      ctx.connection,
      ctx.creator,
      ctx.usdcMint,
      bountyPda2
    );

    await ctx.program.methods
      .postBounty(new anchor.BN(bountyId1), "Bounty 1", new anchor.BN(reward))
      .accountsPartial({
        creator: ctx.creator.publicKey,
        bounty: bountyPda1,
        usdcMint: ctx.usdcMint,
        creatorTokenAccount: ctx.creatorTokenAccount,
        bountyTokenAccount: bountyTokenAccount1,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.creator])
      .rpc();

    await ctx.program.methods
      .postBounty(new anchor.BN(bountyId2), "Bounty 2", new anchor.BN(reward))
      .accountsPartial({
        creator: ctx.creator.publicKey,
        bounty: bountyPda2,
        usdcMint: ctx.usdcMint,
        creatorTokenAccount: ctx.creatorTokenAccount,
        bountyTokenAccount: bountyTokenAccount2,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.creator])
      .rpc();

    const bounty1 = await ctx.program.account.bounty.fetch(bountyPda1);
    const bounty2 = await ctx.program.account.bounty.fetch(bountyPda2);

    expect(bounty1.id.toNumber()).to.equal(bountyId1);
    expect(bounty2.id.toNumber()).to.equal(bountyId2);
    expect(bounty1.reward.toNumber()).to.equal(reward);
    expect(bounty2.reward.toNumber()).to.equal(reward);
  });
});

