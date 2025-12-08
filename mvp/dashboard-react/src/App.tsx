
import React, { useState, useEffect, useMemo } from 'react';
import { DashboardData, ViewState } from './types';
import { fetchDashboardData, updatePostStatus, addAccount } from './services/api';
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

  // Add Accounts State - Premium Sources
  const [premiumSourceHandle, setPremiumSourceHandle] = useState('');
  const [premiumSourcePosts, setPremiumSourcePosts] = useState(2);
  const [addingPremiumSource, setAddingPremiumSource] = useState(false);
  const [deletingPremiumSource, setDeletingPremiumSource] = useState<string | null>(null);
  const [updatingPremiumSource, setUpdatingPremiumSource] = useState<string | null>(null);
  const [editingPosts, setEditingPosts] = useState<Record<string, number>>({});
  
  // Response Triggers State
  const [triggerHandle, setTriggerHandle] = useState('');
  const [addingTrigger, setAddingTrigger] = useState(false);
  const [deletingTrigger, setDeletingTrigger] = useState<string | null>(null);
  
  // Intelligence Gathering State
  const [intelligenceHandle, setIntelligenceHandle] = useState('');
  const [addingIntelligence, setAddingIntelligence] = useState(false);
  const [deletingIntelligence, setDeletingIntelligence] = useState<string | null>(null);
  
  // Research Monitoring State
  const [researchHandle, setResearchHandle] = useState('');
  const [addingResearch, setAddingResearch] = useState(false);
  const [deletingResearch, setDeletingResearch] = useState<string | null>(null);
  
  // Hunting VIPs State
  const [huntingVipHandle, setHuntingVipHandle] = useState('');
  const [addingHuntingVip, setAddingHuntingVip] = useState(false);
  const [deletingHuntingVip, setDeletingHuntingVip] = useState<string | null>(null);
  
  // Status Message
  const [addAccountMessage, setAddAccountMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Load Data
  const refreshData = async () => {
    setLoading(true);
    try {
      const result = await fetchDashboardData();
      console.log('[DEBUG] Dashboard data loaded:', {
        totalQueue: result.queue?.length || 0,
        premiumPosts: result.queue?.filter((p: any) => p.metadata?.tier === 'premium' || p.status === 'pending_manual_review').length || 0,
        accounts: {
          total: result.accounts?.length || 0,
          system: result.accounts?.filter((a: any) => a.type === 'system').length || 0,
          source: result.accounts?.filter((a: any) => a.type === 'source').length || 0,
          target: result.accounts?.filter((a: any) => a.type === 'target').length || 0,
          allAccounts: result.accounts || []
        },
        accountsRaw: result.accounts,
        hasAccounts: !!result.accounts,
        accountsType: typeof result.accounts,
        accountsIsArray: Array.isArray(result.accounts),
        samplePost: result.queue?.[0] ? {
          id: result.queue[0].id,
          status: result.queue[0].status,
          metadata: result.queue[0].metadata,
          hasMetadata: !!result.queue[0].metadata,
          tier: result.queue[0].metadata?.tier
        } : null
      });
      
      // Log accounts separately for easier inspection
      console.log('[DEBUG] Accounts array:', result.accounts);
      console.log('[DEBUG] Accounts length:', result.accounts?.length);
      console.log('[DEBUG] Accounts type:', typeof result.accounts);
      console.log('[DEBUG] Accounts is array:', Array.isArray(result.accounts));
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

  // Filter accounts by type
  const premiumSources = useMemo(() => 
    data?.accounts?.filter((acc: any) => acc.type === 'target') || [], 
    [data]
  );
  
  const responseTriggers = useMemo(() => {
    const triggers = data?.responseTriggers || [];
    console.log('[DEBUG] Response Triggers:', {
      hasData: !!data,
      hasResponseTriggers: !!data?.responseTriggers,
      triggersCount: triggers.length,
      triggers: triggers
    });
    return triggers;
  }, [data]);
  
  const intelligenceAccounts = useMemo(() => 
    data?.accounts?.filter((acc: any) => acc.type === 'intelligence') || [], 
    [data]
  );
  
  const researchAccounts = useMemo(() => 
    data?.accounts?.filter((acc: any) => acc.type === 'source') || [], 
    [data]
  );
  
  const botAccounts = useMemo(() => 
    data?.accounts?.filter((acc: any) => acc.type === 'system') || [], 
    [data]
  );

  const huntingVips = useMemo(() => 
    data?.huntingVips || [], 
    [data]
  );

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

  // Premium Sources Handlers
  const handleAddPremiumSource = async () => {
    if (!premiumSourceHandle.trim()) {
      setAddAccountMessage({ type: 'error', text: 'Handle cannot be empty' });
      setTimeout(() => setAddAccountMessage(null), 3000);
      return;
    }

    setAddingPremiumSource(true);
    setAddAccountMessage(null);

    try {
      const normalizedHandle = premiumSourceHandle.trim().startsWith('@') ? premiumSourceHandle.trim() : `@${premiumSourceHandle.trim()}`;
      await addAccount(normalizedHandle, 'target', premiumSourcePosts);
      setAddAccountMessage({ type: 'success', text: `Successfully added premium source ${normalizedHandle}` });
      setPremiumSourceHandle('');
      setPremiumSourcePosts(2);
      await refreshData();
      setTimeout(() => setAddAccountMessage(null), 3000);
    } catch (error) {
      setAddAccountMessage({ type: 'error', text: `Failed to add account: ${error instanceof Error ? error.message : 'Unknown error'}` });
      setTimeout(() => setAddAccountMessage(null), 5000);
    } finally {
      setAddingPremiumSource(false);
    }
  };

  const handleDeletePremiumSource = async (handle: string) => {
    if (!window.confirm(`Are you sure you want to delete ${handle}?`)) return;
    setDeletingPremiumSource(handle);
    setAddAccountMessage(null);
    // TODO: Implement delete API call
    setAddAccountMessage({ type: 'success', text: `Delete functionality coming soon` });
    setTimeout(() => setAddAccountMessage(null), 3000);
    setDeletingPremiumSource(null);
  };

  const handleUpdatePremiumPosts = async (handle: string, posts: number) => {
    if (posts < 0) {
      setAddAccountMessage({ type: 'error', text: 'Posts to generate must be >= 0' });
      return;
    }
    setUpdatingPremiumSource(handle);
    // TODO: Implement update API call
    setAddAccountMessage({ type: 'success', text: `Update functionality coming soon` });
    setTimeout(() => setAddAccountMessage(null), 3000);
    setUpdatingPremiumSource(null);
  };

  // Response Triggers Handlers
  const handleAddTrigger = async () => {
    if (!triggerHandle.trim()) {
      setAddAccountMessage({ type: 'error', text: 'Handle cannot be empty' });
      setTimeout(() => setAddAccountMessage(null), 3000);
      return;
    }
    setAddingTrigger(true);
    // TODO: Implement add trigger API call
    setAddAccountMessage({ type: 'success', text: `Add trigger functionality coming soon` });
    setTriggerHandle('');
    setTimeout(() => setAddAccountMessage(null), 3000);
    setAddingTrigger(false);
  };

  const handleDeleteTrigger = async (handle: string) => {
    if (!window.confirm(`Are you sure you want to delete trigger ${handle}?`)) return;
    setDeletingTrigger(handle);
    // TODO: Implement delete trigger API call
    setAddAccountMessage({ type: 'success', text: `Delete trigger functionality coming soon` });
    setTimeout(() => setAddAccountMessage(null), 3000);
    setDeletingTrigger(null);
  };

  // Intelligence Gathering Handlers
  const handleAddIntelligence = async () => {
    if (!intelligenceHandle.trim()) {
      setAddAccountMessage({ type: 'error', text: 'Handle cannot be empty' });
      setTimeout(() => setAddAccountMessage(null), 3000);
      return;
    }
    setAddingIntelligence(true);
    const normalizedHandle = intelligenceHandle.trim().startsWith('@') ? intelligenceHandle.trim() : `@${intelligenceHandle.trim()}`;
    try {
      await addAccount(normalizedHandle, 'intelligence');
      setAddAccountMessage({ type: 'success', text: `Successfully added intelligence gathering account ${normalizedHandle}` });
      setIntelligenceHandle('');
      await refreshData();
    } catch (error) {
      setAddAccountMessage({ type: 'error', text: `Failed to add account: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setAddingIntelligence(false);
      setTimeout(() => setAddAccountMessage(null), 3000);
    }
  };

  const handleDeleteIntelligence = async (handle: string) => {
    if (!window.confirm(`Are you sure you want to delete intelligence gathering account ${handle}?`)) return;
    setDeletingIntelligence(handle);
    // TODO: Implement delete intelligence API call
    setAddAccountMessage({ type: 'success', text: `Delete intelligence functionality coming soon` });
    setTimeout(() => setAddAccountMessage(null), 3000);
    setDeletingIntelligence(null);
  };

  // Research Monitoring Handlers
  const handleAddResearch = async () => {
    if (!researchHandle.trim()) {
      setAddAccountMessage({ type: 'error', text: 'Handle cannot be empty' });
      setTimeout(() => setAddAccountMessage(null), 3000);
      return;
    }
    setAddingResearch(true);
    const normalizedHandle = researchHandle.trim().startsWith('@') ? researchHandle.trim() : `@${researchHandle.trim()}`;
    try {
      await addAccount(normalizedHandle, 'source');
      setAddAccountMessage({ type: 'success', text: `Successfully added research account ${normalizedHandle}` });
      setResearchHandle('');
      await refreshData();
    } catch (error) {
      setAddAccountMessage({ type: 'error', text: `Failed to add account: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setAddingResearch(false);
      setTimeout(() => setAddAccountMessage(null), 3000);
    }
  };

  const handleDeleteResearch = async (handle: string) => {
    if (!window.confirm(`Are you sure you want to delete research account ${handle}?`)) return;
    setDeletingResearch(handle);
    // TODO: Implement delete research API call
    setAddAccountMessage({ type: 'success', text: `Delete research functionality coming soon` });
    setTimeout(() => setAddAccountMessage(null), 3000);
    setDeletingResearch(null);
  };

  // Hunting VIPs Handlers
  const handleAddHuntingVip = async () => {
    if (!huntingVipHandle.trim()) {
      setAddAccountMessage({ type: 'error', text: 'Handle cannot be empty' });
      setTimeout(() => setAddAccountMessage(null), 3000);
      return;
    }
    setAddingHuntingVip(true);
    setAddAccountMessage(null);
    // TODO: Implement add hunting VIP API call
    const normalizedHandle = huntingVipHandle.trim().startsWith('@') ? huntingVipHandle.trim() : `@${huntingVipHandle.trim()}`;
    setAddAccountMessage({ type: 'success', text: `Add hunting VIP functionality coming soon` });
    setHuntingVipHandle('');
    setTimeout(() => setAddAccountMessage(null), 3000);
    setAddingHuntingVip(false);
  };

  const handleDeleteHuntingVip = async (handle: string) => {
    if (!window.confirm(`Are you sure you want to delete hunting VIP ${handle}?`)) return;
    setDeletingHuntingVip(handle);
    // TODO: Implement delete hunting VIP API call
    setAddAccountMessage({ type: 'success', text: `Delete hunting VIP functionality coming soon` });
    setTimeout(() => setAddAccountMessage(null), 3000);
    setDeletingHuntingVip(null);
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

    // Add Accounts View
    if (view === 'add-accounts') {
      return (
        <div className="animate-in slide-in-from-right-4 duration-500 p-8 max-w-[1400px] mx-auto w-full">
          {/* Page Header */}
          <div className="mb-8 border-b border-white/10 pb-6">
            <h2 className="text-sm font-mono text-white uppercase tracking-[0.2em] mb-2">
              ADD ACCOUNTS
            </h2>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
              // CONFIGURE SOURCE AND TARGET ACCOUNTS
            </p>
          </div>

          {/* Status Message */}
          {addAccountMessage && (
            <div className={`mb-6 p-4 border ${
              addAccountMessage.type === 'success' 
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' 
                : 'border-red-500/50 bg-red-500/10 text-red-400'
            }`}>
              <p className="text-xs font-mono">{addAccountMessage.text}</p>
            </div>
          )}

          {/* SECTION 1: PREMIUM SOURCES */}
          <div className="flex flex-col gap-6 mb-12">
            {/* Header */}
            <div className="flex items-end justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xs font-mono text-white uppercase tracking-[0.2em] mb-1">
                  PREMIUM_SOURCES
                </h3>
                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                  // POST GENERATION NODES
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {premiumSources.length}
              </span>
            </div>

            {/* Add Account Input */}
            <div className="flex flex-col gap-3">
              {/* Handle Input */}
              <div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
                <span className="text-zinc-500 font-mono">{'>'}</span>
                <input 
                  type="text" 
                  value={premiumSourceHandle}
                  onChange={(e) => setPremiumSourceHandle(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !addingPremiumSource && premiumSourceHandle.trim()) {
                      handleAddPremiumSource();
                    }
                  }}
                  placeholder="ADD_SOURCE_HANDLE" 
                  disabled={addingPremiumSource}
                  className="bg-transparent w-full font-mono text-xs text-white focus:outline-none placeholder:text-zinc-700 uppercase disabled:opacity-50"
                />
                <button 
                  onClick={handleAddPremiumSource}
                  disabled={addingPremiumSource || !premiumSourceHandle.trim()}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {addingPremiumSource ? '[ ... ]' : '[ ADD ]'}
                </button>
              </div>

              {/* Posts Count Input */}
              <div className="group flex items-center gap-3 p-3 border border-zinc-800/50 bg-black/30">
                <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">POSTS:</span>
                <input 
                  type="number" 
                  min="0"
                  value={premiumSourcePosts}
                  onChange={(e) => setPremiumSourcePosts(parseInt(e.target.value) || 0)}
                  disabled={addingPremiumSource}
                  className="bg-black border border-zinc-700 text-white text-xs font-mono w-20 px-2 py-1 focus:outline-none focus:border-white/50 disabled:opacity-50"
                />
                <span className="text-[10px] font-mono text-zinc-600">posts to generate</span>
              </div>
            </div>

            {/* Info Box */}
            <div className="p-4 border border-zinc-800/50 bg-black/30">
              <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
                Accounts scraped for premium post generation. Set posts_to_generate to control how many posts are created per account per cycle.
              </p>
            </div>

            {/* Account List */}
            {premiumSources.length > 0 ? (
              <div className="mt-4">
                <h4 className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
                  CONFIGURED_SOURCES ({premiumSources.length})
                </h4>
                <div className="space-y-px bg-zinc-900/30 border border-white/5">
                  {premiumSources.map((acc: any) => {
                    const isEditing = editingPosts[acc.id] !== undefined;
                    const tempPosts = isEditing ? editingPosts[acc.id] : (acc.posts_to_generate ?? 0);
                    
                    return (
                      <div 
                        key={acc.id} 
                        className="group relative p-4 bg-black hover:bg-white/5 transition-all duration-200 border-b border-white/5 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          {/* Left: Handle */}
                          <div className="flex items-center gap-4">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              acc.enabled !== false ? 'bg-emerald-500' : 'bg-zinc-600'
                            }`}></div>
                            <span className="font-mono text-sm font-bold tracking-tight text-white">
                              {acc.handle}
                            </span>
                          </div>

                          {/* Right: Posts Count + Actions */}
                          <div className="flex items-center gap-4">
                            {/* Posts Count - Editable */}
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={tempPosts}
                                  onChange={(e) => setEditingPosts({ ...editingPosts, [acc.id]: parseInt(e.target.value) || 0 })}
                                  onBlur={() => {
                                    if (tempPosts !== (acc.posts_to_generate ?? 0)) {
                                      handleUpdatePremiumPosts(acc.handle, tempPosts);
                                    }
                                    const newEditing = { ...editingPosts };
                                    delete newEditing[acc.id];
                                    setEditingPosts(newEditing);
                                  }}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      if (tempPosts !== (acc.posts_to_generate ?? 0)) {
                                        handleUpdatePremiumPosts(acc.handle, tempPosts);
                                      }
                                      const newEditing = { ...editingPosts };
                                      delete newEditing[acc.id];
                                      setEditingPosts(newEditing);
                                    } else if (e.key === 'Escape') {
                                      const newEditing = { ...editingPosts };
                                      delete newEditing[acc.id];
                                      setEditingPosts(newEditing);
                                    }
                                  }}
                                  autoFocus
                                  className="bg-black border border-zinc-700 text-white text-xs font-mono w-16 px-2 py-1 focus:outline-none focus:border-white/50"
                                />
                                <span className="text-[9px] font-mono text-zinc-600">posts</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingPosts({ ...editingPosts, [acc.id]: acc.posts_to_generate ?? 0 })}
                                disabled={updatingPremiumSource === acc.handle}
                                className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                              >
                                {acc.posts_to_generate ?? 0} posts
                              </button>
                            )}

                            {/* Status */}
                            <span className={`text-[10px] font-mono uppercase ${
                              acc.enabled !== false ? 'text-emerald-500' : 'text-zinc-600'
                            }`}>
                              {acc.enabled !== false ? 'ACTIVE' : 'PAUSED'}
                            </span>

                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeletePremiumSource(acc.handle)}
                              disabled={deletingPremiumSource === acc.handle}
                              className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingPremiumSource === acc.handle ? '[ ... ]' : '[ DELETE ]'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-white/10 py-12 text-center">
                <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
                  NO_PREMIUM_SOURCES
                </span>
              </div>
            )}
          </div>

          {/* SECTION 2: RESPONSE TRIGGERS */}
          <div className="flex flex-col gap-6 mb-12">
            {/* Header */}
            <div className="flex items-end justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xs font-mono text-white uppercase tracking-[0.2em] mb-1">
                  RESPONSE_TRIGGERS
                </h3>
                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                  // MENTION_DETECTION_NODES
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {responseTriggers.length}
              </span>
            </div>

            {/* Add Trigger Input */}
            <div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
              <span className="text-zinc-500 font-mono">{'>'}</span>
              <input 
                type="text" 
                value={triggerHandle}
                onChange={(e) => setTriggerHandle(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !addingTrigger && triggerHandle.trim()) {
                    handleAddTrigger();
                  }
                }}
                placeholder="ADD_TRIGGER_HANDLE" 
                disabled={addingTrigger}
                className="bg-transparent w-full font-mono text-xs text-white focus:outline-none placeholder:text-zinc-700 uppercase disabled:opacity-50"
              />
              <button 
                onClick={handleAddTrigger}
                disabled={addingTrigger || !triggerHandle.trim()}
                className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addingTrigger ? '[ ... ]' : '[ ADD ]'}
              </button>
            </div>

            {/* Info Box */}
            <div className="p-4 border border-zinc-800/50 bg-black/30">
              <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
                When @pelpa333 mentions these accounts, your bot accounts will automatically reply. Add accounts to expand trigger detection.
              </p>
            </div>

            {/* Trigger List */}
            {responseTriggers.length > 0 ? (
              <div className="mt-4">
                <h4 className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
                  ACTIVE_TRIGGERS ({responseTriggers.length})
                </h4>
                <div className="space-y-px bg-zinc-900/30 border border-white/5">
                  {responseTriggers.map((trigger: string, index: number) => (
                    <div 
                      key={index}
                      className="group relative p-4 bg-black hover:bg-white/5 transition-all duration-200 border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        {/* Left: Handle */}
                        <div className="flex items-center gap-4">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                          <span className="font-mono text-sm font-bold tracking-tight text-white">
                            {trigger}
                          </span>
                        </div>

                        {/* Right: Delete */}
                        <button
                          onClick={() => handleDeleteTrigger(trigger)}
                          disabled={deletingTrigger === trigger}
                          className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingTrigger === trigger ? '[ ... ]' : '[ DELETE ]'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-white/10 py-12 text-center">
                <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
                  NO_TRIGGERS_CONFIGURED
                </span>
              </div>
            )}
          </div>

          {/* SECTION 3: INTELLIGENCE GATHERING */}
          <div className="flex flex-col gap-6 mb-12">
            {/* Header */}
            <div className="flex items-end justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xs font-mono text-white uppercase tracking-[0.2em] mb-1">
                  INTELLIGENCE_GATHERING
                </h3>
                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                  // INTELLIGENCE_GATHERING_NODES
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {intelligenceAccounts.length}
              </span>
            </div>

            {/* Add Intelligence Account Input */}
            <div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
              <span className="text-zinc-500 font-mono">{'>'}</span>
              <input 
                type="text" 
                value={intelligenceHandle}
                onChange={(e) => setIntelligenceHandle(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !addingIntelligence && intelligenceHandle.trim()) {
                    handleAddIntelligence();
                  }
                }}
                placeholder="ADD_INTELLIGENCE_HANDLE" 
                disabled={addingIntelligence}
                className="bg-transparent w-full font-mono text-xs text-white focus:outline-none placeholder:text-zinc-700 uppercase disabled:opacity-50"
              />
              <button 
                onClick={handleAddIntelligence}
                disabled={addingIntelligence || !intelligenceHandle.trim()}
                className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addingIntelligence ? '[ ... ]' : '[ ADD ]'}
              </button>
            </div>

            {/* Info Box */}
            <div className="p-4 border border-zinc-800/50 bg-black/30">
              <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
                Accounts monitored for research and intelligence gathering. Content from these accounts is stored for analysis and content generation.
              </p>
            </div>

            {/* Intelligence Account List */}
            {intelligenceAccounts.length > 0 ? (
              <div className="mt-4">
                <h4 className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
                  MONITORED_ACCOUNTS ({intelligenceAccounts.length})
                </h4>
                <div className="space-y-px bg-zinc-900/30 border border-white/5">
                  {intelligenceAccounts.map((account: any) => (
                    <div 
                      key={account.id} 
                      className="group relative p-4 bg-black hover:bg-white/5 transition-all duration-200 border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        {/* Left: Handle */}
                        <div className="flex items-center gap-4">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                          <span className="font-mono text-sm font-bold tracking-tight text-white">
                            {account.handle}
                          </span>
                        </div>

                        {/* Right: Delete */}
                        <button
                          onClick={() => handleDeleteIntelligence(account.handle)}
                          disabled={deletingIntelligence === account.handle}
                          className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingIntelligence === account.handle ? '[ ... ]' : '[ DELETE ]'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-white/10 py-12 text-center">
                <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
                  NO_INTELLIGENCE_ACCOUNTS
                </span>
              </div>
            )}
          </div>

          {/* SECTION 4: RESEARCH MONITORING */}
          <div className="flex flex-col gap-6 mb-12">
            {/* Header */}
            <div className="flex items-end justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xs font-mono text-white uppercase tracking-[0.2em] mb-1">
                  RESEARCH_MONITORING
                </h3>
                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                  // RESEARCH_MONITORING_NODES
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {researchAccounts.length}
              </span>
            </div>

            {/* Add Research Account Input */}
            <div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
              <span className="text-zinc-500 font-mono">{'>'}</span>
              <input 
                type="text" 
                value={researchHandle}
                onChange={(e) => setResearchHandle(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !addingResearch && researchHandle.trim()) {
                    handleAddResearch();
                  }
                }}
                placeholder="ADD_RESEARCH_HANDLE" 
                disabled={addingResearch}
                className="bg-transparent w-full font-mono text-xs text-white focus:outline-none placeholder:text-zinc-700 uppercase disabled:opacity-50"
              />
              <button 
                onClick={handleAddResearch}
                disabled={addingResearch || !researchHandle.trim()}
                className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addingResearch ? '[ ... ]' : '[ ADD ]'}
              </button>
            </div>

            {/* Info Box */}
            <div className="p-4 border border-zinc-800/50 bg-black/30">
              <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
                Accounts monitored for research and intelligence gathering. Content from these accounts is stored for analysis and content generation.
              </p>
            </div>

            {/* Research Accounts List */}
            {researchAccounts.length > 0 ? (
              <div className="mt-4">
                <h4 className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
                  MONITORED_ACCOUNTS ({researchAccounts.length})
                </h4>
                <div className="space-y-px bg-zinc-900/30 border border-white/5">
                  {researchAccounts.map((account: any) => (
                    <div 
                      key={account.id}
                      className="group relative p-4 bg-black hover:bg-white/5 transition-all duration-200 border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        {/* Left: Handle */}
                        <div className="flex items-center gap-4">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                          <span className="font-mono text-sm font-bold tracking-tight text-white">
                            {account.handle}
                          </span>
                        </div>

                        {/* Right: Delete */}
                        <button
                          onClick={() => handleDeleteResearch(account.handle)}
                          disabled={deletingResearch === account.handle}
                          className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingResearch === account.handle ? '[ ... ]' : '[ DELETE ]'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-white/10 py-12 text-center">
                <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
                  NO_RESEARCH_ACCOUNTS
                </span>
              </div>
            )}
          </div>

          {/* SECTION 4: HUNTING VIPs */}
          <div className="flex flex-col gap-6 mb-12">
            {/* Header */}
            <div className="flex items-end justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xs font-mono text-white uppercase tracking-[0.2em] mb-1">
                  HUNTING_VIPS
                </h3>
                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                  // CAMPAIGN_ENGAGEMENT_NODES
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {huntingVips.length}
              </span>
            </div>

            {/* Add Hunting VIP Input */}
            <div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
              <span className="text-zinc-500 font-mono">{'>'}</span>
              <input 
                type="text" 
                value={huntingVipHandle}
                onChange={(e) => setHuntingVipHandle(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !addingHuntingVip && huntingVipHandle.trim()) {
                    handleAddHuntingVip();
                  }
                }}
                placeholder="ADD_HUNTING_VIP_HANDLE" 
                disabled={addingHuntingVip}
                className="bg-transparent w-full font-mono text-xs text-white focus:outline-none placeholder:text-zinc-700 uppercase disabled:opacity-50"
              />
              <button 
                onClick={handleAddHuntingVip}
                disabled={addingHuntingVip || !huntingVipHandle.trim()}
                className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addingHuntingVip ? '[ ... ]' : '[ ADD ]'}
              </button>
            </div>

            {/* Info Box */}
            <div className="p-4 border border-zinc-800/50 bg-black/30">
              <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
                VIP accounts monitored for campaign-related tweets. When these accounts post tweets matching active campaigns, your bots will proactively engage with persona-based replies.
              </p>
            </div>

            {/* Hunting VIPs List */}
            {huntingVips.length > 0 ? (
              <div className="mt-4">
                <h4 className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
                  ACTIVE_VIPS ({huntingVips.length})
                </h4>
                <div className="space-y-px bg-zinc-900/30 border border-white/5">
                  {huntingVips.map((vip: string, index: number) => (
                    <div 
                      key={index}
                      className="group relative p-4 bg-black hover:bg-white/5 transition-all duration-200 border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        {/* Left: Handle */}
                        <div className="flex items-center gap-4">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                          <span className="font-mono text-sm font-bold tracking-tight text-white">
                            {vip}
                          </span>
                        </div>

                        {/* Right: Delete */}
                        <button
                          onClick={() => handleDeleteHuntingVip(vip)}
                          disabled={deletingHuntingVip === vip}
                          className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingHuntingVip === vip ? '[ ... ]' : '[ DELETE ]'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-white/10 py-12 text-center">
                <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
                  NO_HUNTING_VIPS
                </span>
              </div>
            )}
          </div>

          {/* SECTION 5: BOT ACCOUNTS (Read-only) */}
          <div className="flex flex-col gap-6 mt-8 pt-8 border-t border-white/10">
            {/* Header */}
            <div className="flex items-end justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xs font-mono text-white uppercase tracking-[0.2em] mb-1">
                  BOT_ACCOUNTS
                </h3>
                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                  // YOUR_REPLY_AGENTS
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {botAccounts.length}
              </span>
            </div>

            {/* Info Box */}
            <div className="p-4 border border-zinc-800/50 bg-black/30">
              <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
                Your bot accounts that post replies. These accounts are configured in accounts.yaml. Management coming soon.
              </p>
            </div>

            {/* Bot Accounts Grid */}
            {botAccounts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {botAccounts.map((acc: any) => (
                  <div 
                    key={acc.id}
                    className="group relative p-4 border border-zinc-800/50 bg-black/30 hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      {/* Left: Handle + Status */}
                      <div className="flex items-center gap-4">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          acc.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}></div>
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-bold tracking-tight text-white">
                            {acc.handle}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">
                            {acc.stat_metric || 'PRIORITY_N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Status Badge */}
                      <span className={`text-[10px] font-mono uppercase px-2 py-1 border ${
                        acc.status === 'active' 
                          ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' 
                          : 'text-zinc-600 border-zinc-600/30 bg-zinc-600/10'
                      }`}>
                        {acc.status === 'active' ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-white/10 py-12 text-center">
                <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
                  NO_BOT_ACCOUNTS
                </span>
              </div>
            )}
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
                    { id: 'add-accounts', label: '04 ADD ACCOUNTS' },
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

