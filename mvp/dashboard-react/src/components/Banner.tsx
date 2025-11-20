
import React from 'react';

export const Banner: React.FC = () => {
    return (
        <div className="relative flex flex-col items-start justify-center gap-6 px-8 py-12 border-b border-white/10 bg-black select-none overflow-hidden group/banner">
            {/* Background Technical Grid - Low Opacity */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:16px_16px] opacity-50"></div>
            
            {/* Logo Container - Spacing Only */}
            <div className="relative z-10 pl-2">
                <div className="w-32 h-32 flex items-center justify-center relative group">
                    {/* Empty space to maintain layout */}
                </div>
            </div>
            
            {/* Text Stack with Connector Architecture */}
            <div className="relative z-10 flex flex-col items-start gap-1 pl-2 -mt-8">
                {/* Vertical Connector Line - KEPT AS REQUESTED */}
                <div className="absolute left-0 -top-4 bottom-0 w-px bg-white/10"></div>
                <div className="absolute left-0 top-2 w-3 h-px bg-white/10"></div>
                
                <h1 className="text-xs font-mono font-bold tracking-[0.3em] text-white uppercase leading-none pl-3">
                    XlochaGOS
                </h1>
                <div className="flex items-center gap-2 opacity-50 pl-3">
                    <span className="text-[8px] font-mono text-zinc-400 tracking-[0.2em] uppercase">
                        SYS.OS <span className="text-zinc-600">//</span> v25.10.18
                    </span>
                </div>
            </div>
        </div>
    );
};

