import { NextResponse } from 'next/server';

const AGENT_API_URL = process.env.AGENT_API_URL || 'http://localhost:3003';

export async function POST() {
  try {
    const response = await fetch(`${AGENT_API_URL}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ single_run: true }),
    });

    if (!response.ok) {
      throw new Error(`Agent API returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json({ 
      message: data.message || 'Agent triggered successfully!',
      status: data.status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error triggering agent:', error);
    return NextResponse.json({ 
      error: 'Failed to trigger agent',
      message: error instanceof Error ? error.message : 'Agent trigger failed'
    }, { status: 500 });
  }
}

