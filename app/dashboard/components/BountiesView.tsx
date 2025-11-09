'use client';

import { useState, useEffect } from 'react';

interface Bounty {
  id: number;
  description: string;
  reward: number;
  status: string;
  skills?: string[];
}

export default function BountiesView() {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchBounties();
    const interval = setInterval(fetchBounties, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchBounties = async () => {
    try {
      const response = await fetch('/api/bounties');
      if (response.ok) {
        const data = await response.json();
        setBounties(data.bounties || []);
      }
    } catch (error) {
      console.error('Error fetching bounties:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatReward = (lamports: number) => {
    return (lamports / 1_000_000).toFixed(2);
  };

  if (isLoading) {
    return <div className="text-gray-500 text-sm">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {bounties.length === 0 ? (
        <div className="text-gray-400 text-sm text-center py-8">No bounties discovered yet</div>
      ) : (
        bounties.map((bounty) => (
          <div
            key={bounty.id}
            className="border-2 border-black p-5 hover:bg-gray-50 transition-all"
          >
            <div className="flex justify-between items-start mb-4 pb-3 border-b-2 border-black">
              <span className="text-sm text-gray-600">#{bounty.id}</span>
              <span className="text-sm text-black border-2 border-black px-3 py-1 font-semibold">
                {formatReward(bounty.reward)} SOL
              </span>
            </div>
            <p className="text-sm text-black mb-4 leading-relaxed">{bounty.description}</p>
            <div className="flex items-center justify-between pt-3 border-t-2 border-black">
              <span className="text-xs uppercase text-black border-2 border-black px-2 py-1">
                {bounty.status}
              </span>
              {bounty.skills && bounty.skills.length > 0 && (
                <div className="flex gap-2">
                  {bounty.skills.map((skill, idx) => (
                    <span key={idx} className="text-xs text-black border-2 border-black px-2 py-1">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
