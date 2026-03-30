import React, { useState, useEffect } from 'react';

export function ApiKeyCheck({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasKey(has);
      } else {
        // Fallback if not in AI Studio environment
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success to avoid race conditions as per guidelines
      setHasKey(true);
    }
  };

  if (hasKey === null) return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">Loading...</div>;

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white p-6">
        <h1 className="text-3xl font-bold mb-4">API Key Required</h1>
        <p className="mb-8 text-neutral-400 max-w-md text-center">
          This application uses Nano Banana 2 (Gemini 3.1 Flash Image) which requires a paid Google Cloud API key.
          <br/><br/>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">Learn more about billing</a>
        </p>
        <button 
          onClick={handleSelectKey}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Select API Key
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
