
import React, { useState, useEffect, useMemo } from 'react';
import { DashboardData, ViewState } from './types';
import { fetchDashboardData, updatePostStatus } from './services/api';
import { Banner } from './components/Banner';
import { PostCard } from './components/PostCard';
import { LiveBrowser } from './components/LiveBrowser';

// Command Interface
interface CommandModule {
    id: string;
    label: string;
    subLabel: string;
    cmd: string;
    description: string;
}

const COMMANDS: CommandModule[] = [
    { 
        id: 'respond', 
        label: 'AMPLIFY', 
        subLabel: 'SWARM RESPOND',
        cmd: 'npm run cli swarm respond', 
        description: 'Amplify Pelpa tweets across the network.'
    },
    { 
        id: 'monitor', 
        label: 'MONITOR', 
        subLabel: 'SWARM MONITOR',
        cmd: 'npm run cli swarm monitor', 
        description: 'Detect sideways & inbound opportunities.'
    },
    { 
        id: 'engage', 
        label: 'ENGAGE', 
        subLabel: 'SWARM ENGAGE',
        cmd: 'npm run cli swarm engage', 
        description: 'Process sideways + inbound targets.'
    },
    { 
        id: 'sideways', 
        label: 'SIDEWAYS', 
        subLabel: 'EXECUTE SIDEWAYS',
        cmd: 'npm run cli swarm sideways', 
        description: 'Post sideways reply protocols.'
    },
    { 
        id: 'inbound', 
        label: 'INBOUND', 
        subLabel: 'EXECUTE INBOUND',
        cmd: 'npm run cli swarm inbound', 
        description: 'Post inbound reply protocols.'
    }
];

function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>('dashboard');
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  
  // Command Execution State
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  // Load Data
  const refreshData = async () => {
    setLoading(true);
    try {
      const result = await fetchDashboardData();
      console.log('[DEBUG] Dashboard data loaded:', {
        totalQueue: result.queue?.length || 0,
        premiumPosts: result.queue?.filter((p: any) => p.metadata?.tier === 'premium' || p.status === 'pending_manual_review').length || 0,
        samplePost: result.queue?.[0] ? {
          id: result.queue[0].id,
          status: result.queue[0].status,
          metadata: result.queue[0].metadata,
          hasMetadata: !!result.queue[0].metadata,
          tier: result.queue[0].metadata?.tier
        } : null
      });
      setData(result);
    } catch (error) {
      console.error("Failed to load dashboard", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Helper to safely get metadata (handles string JSON from PostgREST)
  const getMetadata = (post: any): any => {
    if (!post.metadata) return null;
    if (typeof post.metadata === 'string') {
      try {
        return JSON.parse(post.metadata);
      } catch {
        return null;
      }
    }
    return post.metadata;
  };

  // Filtering - Show premium posts by metadata.tier OR status
  const premiumPosts = useMemo(() => {
    const allPosts = data?.queue || [];
    
    // More permissive: show if has premium tier OR pending_manual_review status
    // Also check created_by_agent as fallback
    const filtered = allPosts.filter((p: any) => {
      const metadata = getMetadata(p);
      const hasPremiumTier = metadata?.tier === 'premium';
      const hasPendingReviewStatus = p.status === 'pending_manual_review';
      const isPremiumAgent = p.created_by_agent?.includes('premium') || p.created_by_agent === 'premium_content_generator';
      
      return hasPremiumTier || hasPendingReviewStatus || isPremiumAgent;
    });
    
    // Debug logging - ALWAYS log to help debug
    console.log('[DEBUG] Premium filtering:', {
      totalPosts: allPosts.length,
      filteredCount: filtered.length,
      postsWithMetadata: allPosts.filter((p: any) => p.metadata).length,
      postsWithPremiumTier: allPosts.filter((p: any) => {
        const meta = getMetadata(p);
        return meta?.tier === 'premium';
      }).length,
      postsWithPendingReview: allPosts.filter((p: any) => p.status === 'pending_manual_review').length,
      allStatuses: [...new Set(allPosts.map((p: any) => p.status))],
      allAgents: [...new Set(allPosts.map((p: any) => p.created_by_agent))],
      samplePosts: allPosts.slice(0, 5).map((p: any) => ({
        id: p.id?.substring(0, 8),
        status: p.status,
        metadata: getMetadata(p),
        metadataRaw: p.metadata,
        metadataType: typeof p.metadata,
        agent: p.created_by_agent,
        quality_score: p.quality_score
      }))
    });
    
    // TEMPORARY: If no posts match premium filter, show ALL posts for debugging
    // Remove this after fixing the issue
    if (filtered.length === 0 && allPosts.length > 0) {
      console.warn('[DEBUG] No premium posts found! Showing ALL posts for debugging:', allPosts.length);
      return allPosts;
    }
    
    return filtered;
  }, [data]);

  const autoPosts = useMemo(() => {
    const allPosts = data?.queue || [];
    return allPosts.filter((p: any) => {
      const metadata = getMetadata(p);
      return (metadata?.tier === 'auto' || !metadata?.tier) && p.status === 'pending_approval';
    });
  }, [data]);

  const currentList = view === 'premium' ? premiumPosts : view === 'auto' ? autoPosts : [];

  // Handlers
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedPosts);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPosts(newSet);
  };

  const selectAll = () => {
    const allIds = currentList.map(p => p.id);
    setSelectedPosts(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedPosts(new Set());
  };

  const handleBatchAction = async (action: 'approved' | 'rejected') => {
    if (selectedPosts.size === 0) return;
    if (!window.confirm(`${action === 'approved' ? 'Approve' : 'Reject'} ${selectedPosts.size} items?`)) return;

    setActionLoading(true);
    try {
      await Promise.all(
        Array.from(selectedPosts).map((id) => updatePostStatus(id as string, action))
      );
      await refreshData();
      setSelectedPosts(new Set());
    } catch (e) {
      console.error(e);
      alert('Operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const executeCommand = (cmd: CommandModule) => {
      if (activeCommand) return;
      
      setActiveCommand(cmd.id);
      setTerminalLogs(prev => [...prev, `> ${cmd.cmd}`]);
      
      // Simulate command output
      let steps = 0;
      const interval = setInterval(() => {
          steps++;
          if (steps === 1) {
              setTerminalLogs(prev => [...prev, `  [init] protocol ${cmd.id} started`]);
          } else if (steps === 2) {
              setTerminalLogs(prev => [...prev, `  [process] scanning nodes... OK`]);
          } else if (steps === 3) {
              setTerminalLogs(prev => [...prev, `  [exec] ${cmd.label.toLowerCase()} directive running...`]);
          } else {
              setTerminalLogs(prev => [...prev, `  [done] execution complete`, '']);
              clearInterval(interval);
              setActiveCommand(null);
          }
      }, 2000);
  };

  // Render Content
  const renderContent = () => {
    if (loading) {
      return (
        <div className="h-full w-full flex items-center justify-center text-zinc-500 font-mono text-xs animate-pulse tracking-widest">
          INITIALIZING GEOMETRY...
        </div>
      );
    }

    if (view === 'dashboard') {
      return (
        <div className="animate-in fade-in duration-700 p-8 max-w-[1400px]">
            {/* System Stats Bar - HUD Style */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'ACTIVE NODES', value: data?.intelligence.length || 0 },
                    { label: 'TARGETS', value: data?.research.length || 0 },
                    { label: 'QUEUE SIZE', value: data?.queue.length || 0 },
                    { label: 'ACTION REQUIRED', value: premiumPosts.length, highlight: premiumPosts.length > 0 },
                ].map((stat, i) => (
                    <div key={i} className="relative p-4 border border-black hover:border-black transition-colors group bg-black/40">
                        {/* Corner Markers */}
                        <div className="absolute top-0 left-0 w-1 h-1 bg-white/20 group-hover:bg-white transition-colors"></div>
                        <div className="absolute bottom-0 right-0 w-1 h-1 bg-white/20 group-hover:bg-white transition-colors"></div>
                        
                        <span className="block text-[9px] text-zinc-500 font-mono tracking-[0.2em] mb-2 group-hover:text-white transition-colors">{stat.label}</span>
                        <span className={`text-2xl font-mono font-light tracking-tighter ${stat.highlight ? 'text-white' : 'text-zinc-400 group-hover:text-white'}`}>
                            {stat.value.toString().padStart(3, '0')}
                        </span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Command Grid */}
                <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-900/50 border border-black">
                    {COMMANDS.map((cmd, idx) => (
                        <button
                            key={cmd.id}
                            onClick={() => executeCommand(cmd)}
                            disabled={!!activeCommand}
                            className={`
                                relative p-8 text-left transition-all duration-300 bg-black bg-noise group overflow-hidden
                                ${activeCommand === cmd.id 
                                    ? 'bg-white text-black' 
                                    : 'hover:bg-gradient-to-br hover:from-zinc-100 hover:via-zinc-50 hover:to-white hover:text-black hover:z-10'
                                }
                            `}
                        >
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <span className="font-mono text-[9px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 group-hover:border-black group-hover:text-black transition-colors">
                                    0{idx + 1}
                                </span>
                                <div className={`w-1.5 h-1.5 ${activeCommand === cmd.id ? 'bg-black animate-pulse' : 'bg-zinc-800 group-hover:bg-black'}`} />
                            </div>
                            
                            <h3 className="text-xl font-bold text-white mb-1 tracking-tight group-hover:text-black transition-colors relative z-10">
                                {cmd.label}
                            </h3>
                            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-6 group-hover:text-zinc-800 transition-colors relative z-10">
                                {cmd.subLabel}
                            </p>
                            
                            <div className="mt-auto pt-4 border-t border-zinc-900 group-hover:border-black/20 transition-colors relative z-10">
                                <p className="text-[10px] text-zinc-600 font-mono truncate opacity-60 group-hover:text-black group-hover:opacity-100 transition-all">
                                    $ {cmd.cmd}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Observability Column - Right Side */}
                <div className="xl:col-span-1 flex flex-col gap-6">
                    <LiveBrowser isRunning={!!activeCommand} />

                    {/* Terminal Output */}
                    <div className="flex-1 min-h-[240px] border border-white/10 bg-black p-1 relative overflow-hidden">
                        <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none"></div>
                        <div className="h-full border border-white/5 p-4 overflow-y-auto font-mono text-[10px] leading-relaxed custom-scrollbar relative z-10">
                            <div className="text-zinc-500 mb-4">
                                {'>'} SYSTEM_READY<br/>
                                {'>'} AWAITING_PROTOCOL
                            </div>
                            
                            {terminalLogs.map((log, i) => (
                                <div key={i} className="text-zinc-300 animate-in fade-in slide-in-from-left-1 duration-100">
                                    {log}
                                </div>
                            ))}
                            
                            {activeCommand && (
                                <div className="animate-pulse text-white mt-2">█</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      );
    }

    // List View (Premium or Auto)
    return (
      <div className="animate-in slide-in-from-bottom-4 duration-500 p-8 max-w-5xl mx-auto w-full">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-sm py-6 border-b border-white/10 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <h2 className="text-sm font-mono text-white uppercase tracking-widest">
                    {view === 'premium' ? '// PREMIUM_QUEUE' : '// AUTO_QUEUE'}
                </h2>
                <span className="bg-white text-black px-2 py-0.5 text-[10px] font-bold font-mono">
                    {currentList.length}
                </span>
            </div>
            
            <div className="flex gap-6">
                {selectedPosts.size > 0 && (
                    <div className="flex gap-4 mr-4 border-r border-zinc-800 pr-6">
                        <button 
                            disabled={actionLoading}
                            onClick={() => handleBatchAction('approved')}
                            className="text-[10px] font-mono uppercase hover:text-emerald-400 text-zinc-400 transition-colors"
                        >
                            [ EXECUTE ]
                        </button>
                        <button 
                            disabled={actionLoading}
                            onClick={() => handleBatchAction('rejected')}
                            className="text-[10px] font-mono uppercase hover:text-red-500 text-zinc-600 transition-colors"
                        >
                            [ DISCARD ]
                        </button>
                    </div>
                )}
                
                <button onClick={selectAll} className="text-zinc-500 hover:text-white text-[10px] font-mono uppercase transition-colors">ALL</button>
                <button onClick={deselectAll} className="text-zinc-500 hover:text-white text-[10px] font-mono uppercase transition-colors">NONE</button>
            </div>
        </div>

        {/* List */}
        <div className="space-y-4 pb-20">
            {currentList.length === 0 ? (
                <div className="border border-dashed border-white/10 py-20 text-center">
                    <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">VOID</span>
                </div>
            ) : (
                currentList.map(post => (
                    <PostCard 
                        key={post.id} 
                        post={post} 
                        isSelected={selectedPosts.has(post.id)} 
                        onToggleSelect={toggleSelect} 
                    />
                ))
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-black text-white selection:bg-white selection:text-black font-sans overflow-hidden">
        
        {/* SIDEBAR - LAWS OF GEOMETRY */}
        <aside className="w-72 flex-shrink-0 flex flex-col border-r border-white/10 bg-black z-20 hidden md:flex relative">
            {/* Technical Texture for Sidebar Only */}
            <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none"></div>
            
            <Banner />
            
            <nav className="flex-1 flex flex-col py-8 relative z-10">
                {/* Left Connector Line */}
                <div className="absolute left-6 top-0 bottom-0 w-px bg-white/5"></div>

                {[
                    { id: 'dashboard', label: '01 OVERVIEW' },
                    { id: 'premium', label: '02 PREMIUM' },
                    { id: 'auto', label: '03 AUTO' },
                ].map((item, index) => {
                    const isActive = view === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setView(item.id as ViewState)}
                            className="group relative flex items-center w-full text-left h-14 focus:outline-none"
                        >
                            {/* Hover/Active Background Highlight */}
                            <div className={`absolute inset-y-0 left-0 right-0 transition-opacity duration-300 ${isActive ? 'bg-white/5 opacity-100' : 'bg-white/0 opacity-0 group-hover:opacity-100'}`}></div>

                            {/* Connector Notch */}
                            <div className={`absolute left-6 w-3 h-px transition-colors duration-300 ${isActive ? 'bg-white' : 'bg-white/10 group-hover:bg-white/50'}`}></div>

                            <div className="pl-12 flex items-center justify-between w-full pr-6">
                                <span className={`
                                    text-[10px] font-mono tracking-[0.2em] uppercase transition-all duration-300
                                    ${isActive ? 'text-white translate-x-1' : 'text-zinc-500 group-hover:text-zinc-300'}
                                `}>
                                    {isActive ? `[ ${item.label} ]` : item.label}
                                </span>
                                
                                {/* Active Indicator */}
                                <div className={`
                                    w-1.5 h-1.5 rotate-45 border transition-all duration-300
                                    ${isActive ? 'bg-white border-white' : 'border-zinc-800 bg-black group-hover:border-zinc-600'}
                                `}></div>
                            </div>
                        </button>
                    );
                })}
            </nav>

            {/* Premium Image */}
            <div className="px-8 pb-6 relative z-10 mt-auto">
                <div className="w-full flex items-center justify-center mb-4">
                    <img 
                        src="/assets/iMKtof3lYmBVP5XX_y0yJ.png"
                        alt="Premium" 
                        className="w-full h-auto object-contain max-h-24"
                    />
                </div>
            </div>

            {/* Technical Footer - Minimal Revert */}
            <div className="px-8 pb-10 relative z-10">
                <div className="flex flex-col gap-3 border-t border-white/10 pt-6">
                    <div className="flex justify-between items-center">
                        <span className="text-[9px] font-mono text-zinc-600 tracking-widest">SYSTEM</span>
                        <span className="text-[9px] font-mono text-emerald-500 tracking-wider flex items-center gap-1">
                            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
                            ONLINE
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[9px] font-mono text-zinc-600 tracking-widest">NETWORK</span>
                        <span className="text-[9px] font-mono text-zinc-400 tracking-wider">MAINNET</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[9px] font-mono text-zinc-600 tracking-widest">LATENCY</span>
                        <span className="text-[9px] font-mono text-zinc-400 tracking-wider">12ms</span>
                    </div>
                </div>
            </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 flex flex-col min-w-0 bg-grid overflow-hidden relative">
            {/* Scanline overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none z-0"></div>
            
            {/* Mobile Header */}
            <div className="md:hidden p-4 border-b border-white/10 flex justify-between items-center bg-black z-10">
                 <span className="font-mono font-bold text-sm tracking-widest">XLOCHAGOS</span>
                 <div className="flex gap-2">
                    {/* Mobile Menu would go here in production */}
                 </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
                {renderContent()}
            </div>
        </main>
    </div>
  );
}

export default App;

