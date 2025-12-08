import React, { useEffect, useState } from 'react';

const AGENT_STEPS = [
    { status: 'IDLE', url: 'about:blank' },
    { status: 'NAVIGATING', url: 'x.com/search?q=crypto' },
    { status: 'SCRAPING_DOM', url: 'x.com/status/178...' },
    { status: 'ANALYZING_TEXT', url: 'x.com/status/178...' },
    { status: 'GENERATING_RESPONSE', url: 'internal://inference' },
    { status: 'TYPING', url: 'x.com/status/178.../reply' },
    { status: 'SUBMITTING', url: 'x.com/status/178.../reply' },
];

export const LiveBrowser: React.FC<{ isRunning: boolean }> = ({ isRunning }) => {
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        if (!isRunning) {
            setStepIndex(0);
            return;
        }

        const interval = setInterval(() => {
            setStepIndex((prev) => (prev + 1) % AGENT_STEPS.length);
        }, 1500);

        return () => clearInterval(interval);
    }, [isRunning]);

    const currentStep = AGENT_STEPS[stepIndex];

    return (
        <div className="w-full border border-zinc-900 bg-black rounded-lg overflow-hidden flex flex-col shadow-2xl mb-4 h-[240px]">
            {/* Browser Chrome */}
            <div className="bg-zinc-900/50 border-b border-zinc-900 p-2 flex items-center gap-3">
                <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                    <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                    <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                </div>
                <div className="flex-1 bg-black border border-zinc-800 rounded px-2 py-0.5 flex items-center">
                    <span className="text-[9px] font-mono text-zinc-500 truncate">
                        {isRunning ? currentStep.url : 'browser://disconnected'}
                    </span>
                </div>
            </div>

            {/* Viewport Content */}
            <div className="flex-1 relative p-4 flex flex-col gap-3">
                {/* Simulated Webpage Wireframe */}
                <div className={`transition-opacity duration-500 ${isRunning ? 'opacity-100' : 'opacity-20'}`}>
                    {/* Avatar & Name Skeleton */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-zinc-800/50 animate-pulse"></div>
                        <div className="space-y-1">
                            <div className="w-20 h-2 bg-zinc-800/50 rounded animate-pulse"></div>
                            <div className="w-12 h-1.5 bg-zinc-900 rounded"></div>
                        </div>
                    </div>
                    
                    {/* Content Skeleton */}
                    <div className="space-y-2 mb-4">
                        <div className="w-full h-2 bg-zinc-800/30 rounded"></div>
                        <div className="w-[90%] h-2 bg-zinc-800/30 rounded"></div>
                        <div className="w-[95%] h-2 bg-zinc-800/30 rounded"></div>
                    </div>

                    {/* Interaction Area */}
                    <div className="mt-6 border-t border-zinc-900 pt-3">
                         <div className="w-full h-16 border border-zinc-800 rounded bg-zinc-900/20 relative overflow-hidden">
                            {currentStep.status === 'TYPING' && (
                                <div className="absolute top-2 left-2 w-0.5 h-3 bg-emerald-500 animate-pulse"></div>
                            )}
                            {currentStep.status === 'GENERATING_RESPONSE' && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-[9px] font-mono text-emerald-500/50 uppercase tracking-widest animate-pulse">Thinking...</span>
                                </div>
                            )}
                         </div>
                    </div>
                </div>

                {/* Agent Overlay (HUD) */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-3">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Agent View</span>
                            <span className={`text-[10px] font-mono uppercase tracking-wider ${isRunning ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                {isRunning ? currentStep.status : 'OFFLINE'}
                            </span>
                        </div>
                        {isRunning && (
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                        )}
                    </div>
                </div>

                {/* Scanlines */}
                <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px] pointer-events-none opacity-20"></div>
            </div>
        </div>
    );
};





