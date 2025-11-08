import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bountyforge } from "../target/types/bountyforge";
import {
    TOKEN_PROGRAM_ID,
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export interface TestContext {
    provider: anchor.AnchorProvider;
    program: Program<Bountyforge>;
    connection: anchor.web3.Connection;
    creator: Keypair;
    usdcMint: PublicKey;
    creatorTokenAccount: PublicKey;
}

export async function setupTestContext(): Promise<TestContext> {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.bountyforge as Program<Bountyforge>;
    const connection = provider.connection;

    const creator = Keypair.generate();

    const airdropSignature = await connection.requestAirdrop(
        creator.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSignature);

    const usdcMint = await createMint(
        connection,
        creator,
        creator.publicKey,
        null,
        6
    );

    const creatorTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        creator,
        usdcMint,
        creator.publicKey
    );
    const creatorTokenAccount = creatorTokenAccountInfo.address;

    const mintAmount = 1000 * 10 ** 6;
    await mintTo(
        connection,
        creator,
        usdcMint,
        creatorTokenAccount,
        creator,
        mintAmount
    );

    return {
        provider,
        program,
        connection,
        creator,
        usdcMint,
        creatorTokenAccount,
    };
}

export function getAssociatedTokenAddressSync(
    mint: PublicKey,
    owner: PublicKey
): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return address;
}

export function deriveBountyPda(
    programId: PublicKey,
    bountyId: number
): [PublicKey, number] {
    const bountyIdBuffer = Buffer.allocUnsafe(8);
    bountyIdBuffer.writeBigUInt64LE(BigInt(bountyId), 0);
    return PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), bountyIdBuffer],
        programId
    );
}

export function deriveAttestationPda(
    programId: PublicKey,
    solutionId: number
): [PublicKey, number] {
    const solutionIdBuffer = Buffer.allocUnsafe(8);
    solutionIdBuffer.writeBigUInt64LE(BigInt(solutionId), 0);
    return PublicKey.findProgramAddressSync(
        [Buffer.from("attest"), solutionIdBuffer],
        programId
    );
}

export function deriveReputationPda(
    programId: PublicKey,
    agent: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("rep"), agent.toBuffer()],
        programId
    );
}

export async function ensureCreatorBalance(
    connection: anchor.web3.Connection,
    creator: Keypair,
    usdcMint: PublicKey,
    creatorTokenAccount: PublicKey,
    requiredAmount: number
): Promise<void> {
    const balance = await connection.getTokenAccountBalance(creatorTokenAccount);
    if (Number(balance.value.amount) < requiredAmount) {
        const mintAmount = requiredAmount - Number(balance.value.amount);
        await mintTo(
            connection,
            creator,
            usdcMint,
            creatorTokenAccount,
            creator,
            mintAmount
        );
    }
}

export async function createBountyTokenAccount(
    connection: anchor.web3.Connection,
    creator: Keypair,
    usdcMint: PublicKey,
    bountyPda: PublicKey
): Promise<void> {
    try {
        await getOrCreateAssociatedTokenAccount(
            connection,
            creator,
            usdcMint,
            bountyPda,
            true
        );
    } catch (e) {
        // Account might already exist
    }
}

export async function airdropSol(
    connection: anchor.web3.Connection,
    pubkey: PublicKey,
    amount: number = 2
): Promise<void> {
    const signature = await connection.requestAirdrop(
        pubkey,
        amount * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);
}

export async function createAgentTokenAccount(
    connection: anchor.web3.Connection,
    agent: Keypair,
    usdcMint: PublicKey
): Promise<PublicKey> {
    const accountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        agent,
        usdcMint,
        agent.publicKey
    );
    return accountInfo.address;
}

export function generateRandomId(): number {
    return Math.floor(Math.random() * 1000000);
}

export function generateSolutionHash(): Buffer {
    return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)));
}

export function generateSolutionHashWithValue(value: number): Buffer {
    return Buffer.from(Array.from({ length: 32 }, () => value));
}

export async function postBounty(
    ctx: TestContext,
    bountyId: number,
    description: string,
    reward: number
): Promise<anchor.web3.PublicKey> {
    const [bountyPda] = deriveBountyPda(ctx.program.programId, bountyId);
    const bountyTokenAccount = getAssociatedTokenAddressSync(
        ctx.usdcMint,
        bountyPda
    );

    await createBountyTokenAccount(
        ctx.connection,
        ctx.creator,
        ctx.usdcMint,
        bountyPda
    );

    await ctx.program.methods
        .postBounty(new anchor.BN(bountyId), description, new anchor.BN(reward))
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

    return bountyPda;
}

export async function createAttestation(
    ctx: TestContext,
    agent: Keypair,
    solutionId: number,
    solutionHash: Buffer
): Promise<anchor.web3.PublicKey> {
    const [attestationPda] = deriveAttestationPda(
        ctx.program.programId,
        solutionId
    );

    await ctx.program.methods
        .attestSolution(new anchor.BN(solutionId), Array.from(solutionHash))
        .accountsPartial({
            agent: agent.publicKey,
            attestation: attestationPda,
            systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

    return attestationPda;
}

export async function submitSolution(
    ctx: TestContext,
    agent: Keypair,
    bountyPda: anchor.web3.PublicKey,
    attestationPda: anchor.web3.PublicKey,
    solutionHash: Buffer
): Promise<void> {
    const [reputationPda] = deriveReputationPda(
        ctx.program.programId,
        agent.publicKey
    );

    await ctx.program.methods
        .submitSolution(Array.from(solutionHash))
        .accountsPartial({
            agent: agent.publicKey,
            bounty: bountyPda,
            attestation: attestationPda,
            reputation: reputationPda,
            systemProgram: SystemProgram.programId,
        })
        .signers([agent])
        .rpc();
}

