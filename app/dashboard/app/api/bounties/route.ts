import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

const AGENT_API_URL = process.env.AGENT_API_URL || 'http://localhost:3003';

export async function GET() {
  try {
    const response = await fetch(`${AGENT_API_URL}/bounties`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({ bounties: data.bounties || [] });
    }
  } catch (error) {
    console.error('Error fetching bounties from agent API:', error);
  }

  try {
    const bountiesPath = join(process.cwd(), '..', 'agent', 'bounties', 'mock_bounties.json');
    const fileContent = await readFile(bountiesPath, 'utf-8');
    const bounties = JSON.parse(fileContent);
    return NextResponse.json({ bounties });
  } catch (error) {
    const mockBounties = [
      {
        id: 1,
        description: 'Solve Solana puzzle: Calculate the average SOL/USD price over the last 24 hours',
        reward: 1000000,
        status: 'open',
        skills: ['oracle', 'data'],
      },
      {
        id: 2,
        description: 'Debug smart contract: Find and fix the overflow bug in the token transfer function',
        reward: 2000000,
        status: 'open',
        skills: ['code_analysis', 'debugging'],
      },
      {
        id: 3,
        description: 'Data analysis: Analyze transaction patterns and identify anomalies',
        reward: 1500000,
        status: 'open',
        skills: ['data_analysis', 'pattern_recognition'],
      },
    ];
    return NextResponse.json({ bounties: mockBounties });
  }
}

