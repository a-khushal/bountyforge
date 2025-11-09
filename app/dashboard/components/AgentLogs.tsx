'use client';

import { useState, useEffect } from 'react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'error';
  message: string;
}

export default function AgentLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-gray-500 text-sm">Loading...</div>;
  }

  return (
    <div>
      <div className="bg-white border-2 border-black p-6 h-[600px] overflow-y-auto text-xs">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No logs available</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-3 pb-3 border-b-2 border-black text-black last:border-b-0">
              <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className="mx-3 text-black border-2 border-black px-2 py-0.5">[{log.level.toUpperCase()}]</span>
              <span className="text-black">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
