'use client';

import { useState } from 'react';

export default function TriggerAgent() {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState('');

  const handleTrigger = async () => {
    setIsRunning(true);
    setMessage('Triggering...');
    
    try {
      const response = await fetch('/api/trigger', {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessage(data.message || 'Triggered');
      } else {
        setMessage('Failed');
      }
    } catch (error) {
      setMessage('Error');
      console.error(error);
    } finally {
      setIsRunning(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  return (
    <div className="border-2 border-black p-6 bg-white">
      <h3 className="text-sm font-normal text-black mb-4 border-b-2 border-black pb-3 uppercase tracking-wide">Control</h3>
      
      <button
        onClick={handleTrigger}
        disabled={isRunning}
        className={`w-full py-3 px-4 text-sm border-2 border-black text-black transition-colors ${
          isRunning
            ? 'opacity-50 cursor-not-allowed bg-gray-200'
            : 'bg-white hover:bg-black hover:text-white'
        }`}
      >
        {isRunning ? 'Running...' : 'Trigger Agent'}
      </button>

      {message && (
        <div className="mt-4 text-xs text-black border-2 border-black p-3 bg-white">
          {message}
        </div>
      )}

      <div className="mt-4 text-xs text-black border-2 border-black p-3 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-black rounded-full"></div>
          <span>Active</span>
        </div>
      </div>
    </div>
  );
}
