import { NextResponse } from 'next/server';

const AGENT_API_URL = process.env.AGENT_API_URL || 'http://localhost:3003';
const AGENT_WALLET_ADDRESS = process.env.AGENT_WALLET_ADDRESS || '';

export async function GET() {
  try {
    // Try to get signing address from agent API if AGENT_WALLET_ADDRESS not set
    let agentAddress = AGENT_WALLET_ADDRESS;
    
    if (!agentAddress) {
      try {
        const walletResponse = await fetch(`${AGENT_API_URL}/wallet`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (walletResponse.ok) {
          const walletData = await walletResponse.json();
          agentAddress = walletData.signing_address;
        }
      } catch (e) {
        // Ignore errors, will use default
      }
    }

    if (!agentAddress) {
      return NextResponse.json({ 
        reputation: {
          score: 0,
          successful_bounties: 0,
          failed_bounties: 0,
          total_earned: 0,
          message: "Agent not initialized. Trigger agent first to create signing address."
        }
      });
    }

    const response = await fetch(`${AGENT_API_URL}/reputation?address=${agentAddress}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({ reputation: data.reputation || {
        score: 0,
        successful_bounties: 0,
        failed_bounties: 0,
        total_earned: 0
      }});
    }

    return NextResponse.json({ 
      reputation: {
        score: 0,
        successful_bounties: 0,
        failed_bounties: 0,
        total_earned: 0
      }
    });
  } catch (error) {
    console.error('Error fetching reputation:', error);
    return NextResponse.json({ 
      reputation: {
        score: 0,
        successful_bounties: 0,
        failed_bounties: 0,
        total_earned: 0
      }
    });
  }
}

