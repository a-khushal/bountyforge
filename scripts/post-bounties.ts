import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bountyforge } from "../target/types/bountyforge";
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

function deriveBountyPda(
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

interface BountyData {
    id: number;
    description: string;
    reward: number;
}

async function postBounty(
    program: Program<Bountyforge>,
    connection: anchor.web3.Connection,
    creator: Keypair,
    usdcMint: PublicKey,
    creatorTokenAccount: PublicKey,
    bountyData: BountyData
): Promise<PublicKey> {
    const [bountyPda, _bump] = deriveBountyPda(program.programId, bountyData.id);

    const bountyAccountInfo = await connection.getAccountInfo(bountyPda);
    if (bountyAccountInfo !== null) {
        try {
            const bounty = await program.account.bounty.fetch(bountyPda);
            console.log(`Bounty #${bountyData.id} already exists, skipping...`);
            return bountyPda;
        } catch (e) {
            console.error(`Bounty PDA ${bountyPda.toString()} exists but is corrupted. Cannot post bounty #${bountyData.id}.`);
            console.error(`   Error: ${e instanceof Error ? e.message : String(e)}`);
            console.error(`   You may need to close this account or use a different bounty ID.`);
            throw new Error(`Cannot post bounty #${bountyData.id}: account exists but is corrupted`);
        }
    }
    const bountyTokenAccount = getAssociatedTokenAddressSync(
        usdcMint,
        bountyPda
    );

    const tokenAccountInfo = await connection.getAccountInfo(bountyTokenAccount);
    const instructions: anchor.web3.TransactionInstruction[] = [];
    
    if (tokenAccountInfo === null) {
        const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
        const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        instructions.push(
            createAssociatedTokenAccountInstruction(
                creator.publicKey,
                bountyTokenAccount,
                bountyPda,
                usdcMint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        );
    }

    const tx = await program.methods
        .postBounty(
            new anchor.BN(bountyData.id),
            bountyData.description,
            new anchor.BN(bountyData.reward)
        )
        .accountsPartial({
            creator: creator.publicKey,
            bounty: bountyPda,
            usdcMint: usdcMint,
            creatorTokenAccount: creatorTokenAccount,
            bountyTokenAccount: bountyTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
            systemProgram: SystemProgram.programId,
        })
        .preInstructions(instructions)
        .signers([creator])
        .rpc();

    console.log(`Posted bounty #${bountyData.id}: ${bountyData.description}`);
    console.log(`   Reward: ${bountyData.reward / 1e6} USDC`);
    console.log(`   Bounty PDA: ${bountyPda.toString()}`);
    console.log(`   Transaction: ${tx}`);

    return bountyPda;
}

async function main() {
    const cluster = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
    const connection = new anchor.web3.Connection(cluster, "confirmed");

    const walletPath = process.env.ANCHOR_WALLET || path.join(
        process.env.HOME || process.env.USERPROFILE || "",
        ".config",
        "solana",
        "id.json"
    );

    if (!fs.existsSync(walletPath)) {
        console.error(`Wallet not found at: ${walletPath}`);
        console.error("   Set ANCHOR_WALLET env var or use default Solana wallet");
        process.exit(1);
    }

    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    );

    const wallet = new anchor.Wallet(walletKeypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });
    anchor.setProvider(provider);

    const programId = new PublicKey("DUYYaLDvkWfFYKB8HshseMi6f5X9ShxaydsfrJLrkGMM");

    let idl;
    try {
        const idlPath = path.join(process.cwd(), "target/idl/bountyforge.json");
        idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    } catch (e) {
        console.error("Failed to load IDL. Make sure to run: anchor build");
        process.exit(1);
    }

    const program = new Program<Bountyforge>(idl as any, provider);

    console.log(`Using wallet: ${walletKeypair.publicKey.toString()}`);
    console.log(`Cluster: ${cluster}`);

    const DEVNET_USDC_MINT = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";

    const usdcMintAddress = process.env.USDC_MINT || DEVNET_USDC_MINT;
    const usdcMint = new PublicKey(usdcMintAddress);

    console.log(`Using USDC mint: ${usdcMint.toString()}`);

    const creatorTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        walletKeypair,
        usdcMint,
        walletKeypair.publicKey
    );
    const creatorTokenAccount = creatorTokenAccountInfo.address;

    const balance = await connection.getTokenAccountBalance(creatorTokenAccount);
    const balanceAmount = Number(balance.value.amount) / 1e6;
    console.log(`Creator USDC balance: ${balanceAmount} USDC`);

    if (balanceAmount < 5) {
        console.error("\n\nInsufficient USDC balance!");
        console.error(`   You have ${balanceAmount} USDC, but need at least 5 USDC to post bounties`);
        console.error("   Total rewards: 4.5 USDC (1 + 2 + 1.5)");
        console.error("\n   Get USDC from devnet faucet:");
        console.error(`   Mint: ${usdcMint.toString()}`);
        console.error(`   Wallet: ${walletKeypair.publicKey.toString()}`);
        console.error("\n   Or use a devnet USDC faucet to airdrop tokens");
        process.exit(1);
    }

    async function checkBountyExists(bountyId: number): Promise<boolean> {
        try {
            const [bountyPda] = deriveBountyPda(program.programId, bountyId);
            const accountInfo = await connection.getAccountInfo(bountyPda);
            return accountInfo !== null;
        } catch {
            return false;
        }
    }

    const baseBounties: BountyData[] = [
        {
            id: 1,
            description: "Solve Solana puzzle: Calculate the average SOL/USD price over the last 24 hours using Switchboard oracle data",
            reward: 1 * 1e6,
        },
        {
            id: 2,
            description: "Debug smart contract: Find and fix the overflow bug in the token transfer function",
            reward: 2 * 1e6,
        },
        {
            id: 3,
            description: "Data analysis: Analyze transaction patterns from the last 7 days and identify anomalies",
            reward: 1.5 * 1e6,
        },
    ];

    const bounties: BountyData[] = [];
    const assignedIds = new Set<number>();

    for (const bounty of baseBounties) {
        let availableId = bounty.id;

        while (await checkBountyExists(availableId) || assignedIds.has(availableId)) {
            availableId++;
        }

        assignedIds.add(availableId);
        bounties.push({
            ...bounty,
            id: availableId
        });
        if (availableId !== bounty.id) {
            console.log(`Bounty ID ${bounty.id} already exists, using ID ${availableId} instead`);
        }
    }

    console.log(`\nPosting ${bounties.length} bounties...\n`);

    for (const bounty of bounties) {
        try {
            await postBounty(
                program,
                connection,
                walletKeypair,
                usdcMint,
                creatorTokenAccount,
                bounty
            );
            console.log("");
        } catch (error: any) {
            console.error(`Failed to post bounty #${bounty.id}:`);
            if (error.message) {
                console.error(`   Error: ${error.message}`);
            }
            if (error.logs && Array.isArray(error.logs)) {
                console.error("   Logs:");
                error.logs.forEach((log: string) => console.error(`     ${log}`));
            }
            if (error.error) {
                console.error(`   Anchor Error: ${error.error.errorCode?.code || error.error}`);
            }
            if (!error.message && !error.logs && !error.error) {
                console.error(`   ${String(error)}`);
            }
        }
    }

    console.log("Done! Agent will discover these bounties on next scan.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });


