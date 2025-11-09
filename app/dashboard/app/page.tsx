'use client';

import { useState } from 'react';
import AgentLogs from '@/components/AgentLogs';
import BountiesView from '@/components/BountiesView';
import ReputationScore from '@/components/ReputationScore';
import TriggerAgent from '@/components/TriggerAgent';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'logs' | 'bounties' | 'reputation'>('logs');

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-8 py-12 max-w-7xl">
        <header className="mb-12 border-b-2 border-black pb-6">
          <h1 className="text-3xl font-normal text-black mb-2">BountyForge</h1>
          <p className="text-sm text-gray-600">Autonomous Bounty Hunter Agent</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <TriggerAgent />
            <ReputationScore />
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white border-2 border-black">
              <div className="flex border-b-2 border-black">
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`px-6 py-4 text-sm border-r-2 border-black transition-colors ${
                    activeTab === 'logs'
                      ? 'bg-black text-white border-b-2 border-black -mb-0.5'
                      : 'bg-white text-black hover:bg-gray-50'
                  }`}
                >
                  Logs
                </button>
                <button
                  onClick={() => setActiveTab('bounties')}
                  className={`px-6 py-4 text-sm border-r-2 border-black transition-colors ${
                    activeTab === 'bounties'
                      ? 'bg-black text-white border-b-2 border-black -mb-0.5'
                      : 'bg-white text-black hover:bg-gray-50'
                  }`}
                >
                  Bounties
                </button>
                <button
                  onClick={() => setActiveTab('reputation')}
                  className={`px-6 py-4 text-sm border-r-2 border-black transition-colors ${
                    activeTab === 'reputation'
                      ? 'bg-black text-white border-b-2 border-black -mb-0.5'
                      : 'bg-white text-black hover:bg-gray-50'
                  }`}
                >
                  Reputation
                </button>
              </div>

              <div className="p-8">
                {activeTab === 'logs' && <AgentLogs />}
                {activeTab === 'bounties' && <BountiesView />}
                {activeTab === 'reputation' && <ReputationScore />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
