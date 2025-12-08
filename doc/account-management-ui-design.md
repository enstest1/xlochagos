# Account Management UI - Complete Design Specification

## 🎨 Design Theme Reference

**Current Theme:**
- Background: Black (`#000000`) with subtle grid pattern
- Text: White with zinc grays for secondary text
- Fonts: Monospace (`font-mono`) for all UI elements
- Typography: Uppercase with wide letter spacing (`tracking-[0.2em]`, `tracking-wider`)
- Borders: `border-white/10`, `border-zinc-800/50`
- Hover Effects: `hover:border-white/30`, `hover:text-white`
- Status Colors: Emerald (`text-emerald-500`) for active, Zinc (`text-zinc-600`) for inactive
- Text Sizes: `text-xs` (12px), `text-[10px]` (10px), `text-[9px]` (9px)
- Terminal Style: `>` prompt, uppercase placeholders, monospace inputs

---

## 📐 Complete UI Structure

### Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ ADD ACCOUNTS // CONFIGURE ACCOUNTS                                   │
│ // MANAGE PREMIUM SOURCES, TRIGGERS, RESEARCH & BOT ACCOUNTS         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ┌─ SECTION 1: PREMIUM SOURCES ───────────────────────────────────┐ │
│ │ Accounts scraped for post generation                             │ │
│ │ [Input + Posts Count] [ADD]                                     │ │
│ │ [Account List with Delete + Edit Posts]                         │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ ┌─ SECTION 2: RESPONSE TRIGGERS ──────────────────────────────────┐ │
│ │ Accounts that trigger bot replies                                │ │
│ │ [Input] [ADD]                                                    │ │
│ │ [Account List with Delete]                                      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ ┌─ SECTION 3: RESEARCH MONITORING ───────────────────────────────┐ │
│ │ Accounts monitored for research/intelligence                      │ │
│ │ [Input] [ADD]                                                    │ │
│ │ [Account List with Delete]                                      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ ┌─ SECTION 4: BOT ACCOUNTS (Read-only) ──────────────────────────┐ │
│ │ Your accounts that post replies                                  │ │
│ │ [Account List - Status Only]                                    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Section 1: Premium Sources (Post Generation)

### Purpose
Accounts scraped to generate premium posts. Each account has a `posts_to_generate` count.

### Visual Design

```tsx
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
  {premiumSources.length > 0 && (
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
                      disabled={updatingAccount === acc.handle}
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
                    disabled={deletingAccount === acc.handle}
                    className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingAccount === acc.handle ? '[ ... ]' : '[ DELETE ]'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )}

  {/* Empty State */}
  {premiumSources.length === 0 && (
    <div className="border border-dashed border-white/10 py-12 text-center">
      <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
        NO_PREMIUM_SOURCES
      </span>
    </div>
  )}
</div>
```

### Styling Details
- **Container:** `flex flex-col gap-6 mb-12`
- **Header:** Border bottom `border-white/10`, uppercase monospace
- **Input:** Terminal style with `>` prompt, `border-zinc-800`, `bg-black/50`
- **List Items:** `bg-black` with `hover:bg-white/5`, `border-white/5` between items
- **Status Indicator:** Small dot (`w-1.5 h-1.5`) - emerald for active, zinc for paused
- **Buttons:** `opacity-0 group-hover:opacity-100` for hover reveal
- **Text Sizes:** Handle `text-sm`, actions `text-[10px]`, labels `text-[9px]`

---

## 🎯 Section 2: Response Triggers

### Purpose
Accounts that trigger bot replies when @pelpa333 mentions them.

### Visual Design

```tsx
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
  {responseTriggers.length > 0 && (
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
  )}

  {/* Empty State */}
  {responseTriggers.length === 0 && (
    <div className="border border-dashed border-white/10 py-12 text-center">
      <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
        NO_TRIGGERS_CONFIGURED
      </span>
    </div>
  )}
</div>
```

### Styling Details
- **Same structure as Premium Sources** but simpler (no posts count)
- **Status Indicator:** Indigo dot (`bg-indigo-500`) to differentiate from premium sources
- **No inline editing** - just add/delete

---

## 🎯 Section 3: Research Monitoring

### Purpose
Accounts monitored for research/intelligence gathering.

### Visual Design

```tsx
{/* SECTION 3: RESEARCH MONITORING */}
<div className="flex flex-col gap-6 mb-12">
  {/* Header */}
  <div className="flex items-end justify-between border-b border-white/10 pb-4">
    <div>
      <h3 className="text-xs font-mono text-white uppercase tracking-[0.2em] mb-1">
        RESEARCH_MONITORING
      </h3>
      <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
        // INTELLIGENCE_GATHERING_NODES
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
  {researchAccounts.length > 0 && (
    <div className="mt-4">
      <h4 className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
        MONITORED_ACCOUNTS ({researchAccounts.length})
      </h4>
      <div className="space-y-px bg-zinc-900/30 border border-white/5">
        {researchAccounts.map((account: string, index: number) => (
          <div 
            key={index}
            className="group relative p-4 bg-black hover:bg-white/5 transition-all duration-200 border-b border-white/5 last:border-0"
          >
            <div className="flex items-center justify-between">
              {/* Left: Handle */}
              <div className="flex items-center gap-4">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                <span className="font-mono text-sm font-bold tracking-tight text-white">
                  {account}
                </span>
              </div>

              {/* Right: Delete */}
              <button
                onClick={() => handleDeleteResearch(account)}
                disabled={deletingResearch === account}
                className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingResearch === account ? '[ ... ]' : '[ DELETE ]'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )}

  {/* Empty State */}
  {researchAccounts.length === 0 && (
    <div className="border border-dashed border-white/10 py-12 text-center">
      <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
        NO_RESEARCH_ACCOUNTS
      </span>
    </div>
  )}
</div>
```

### Styling Details
- **Same structure as Response Triggers**
- **Status Indicator:** Amber dot (`bg-amber-500`) to differentiate
- **Simple add/delete** functionality

---

## 🎯 Section 4: Bot Accounts (Read-only)

### Purpose
Display your bot accounts that post replies. Read-only for now.

### Visual Design

```tsx
{/* SECTION 4: BOT ACCOUNTS (Read-only) */}
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
  {botAccounts.length > 0 && (
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
                  {acc.stat_metric || 'PRIORITY_' + (acc.priority || 'N/A')}
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
  )}

  {/* Empty State */}
  {botAccounts.length === 0 && (
    <div className="border border-dashed border-white/10 py-12 text-center">
      <span className="text-zinc-600 font-mono text-xs uppercase tracking-widest">
        NO_BOT_ACCOUNTS
      </span>
    </div>
  )}
</div>
```

### Styling Details
- **Grid Layout:** `grid-cols-1 md:grid-cols-2` for responsive display
- **Read-only:** No delete buttons, just display
- **Status Badge:** Colored badge with border for active/paused
- **Separator:** Top border `border-t border-white/10` to separate from other sections

---

## 🎨 Complete Component Structure

### Full Accounts View Component

```tsx
if (view === 'accounts') {
  // State variables needed:
  // Premium Sources
  const [premiumSourceHandle, setPremiumSourceHandle] = useState('');
  const [premiumSourcePosts, setPremiumSourcePosts] = useState(2);
  const [addingPremiumSource, setAddingPremiumSource] = useState(false);
  const [deletingPremiumSource, setDeletingPremiumSource] = useState<string | null>(null);
  const [updatingPremiumSource, setUpdatingPremiumSource] = useState<string | null>(null);
  const [editingPosts, setEditingPosts] = useState<Record<string, number>>({});
  
  // Response Triggers
  const [triggerHandle, setTriggerHandle] = useState('');
  const [addingTrigger, setAddingTrigger] = useState(false);
  const [deletingTrigger, setDeletingTrigger] = useState<string | null>(null);
  
  // Research Monitoring
  const [researchHandle, setResearchHandle] = useState('');
  const [addingResearch, setAddingResearch] = useState(false);
  const [deletingResearch, setDeletingResearch] = useState<string | null>(null);
  
  // Status Message
  const [statusMessage, setStatusMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Filter accounts by type
  const premiumSources = useMemo(() => 
    data?.accounts?.filter((acc: any) => acc.type === 'target') || [], 
    [data]
  );
  
  const responseTriggers = useMemo(() => 
    // Get from monitoring.trigger_mentions - need to fetch separately or include in data
    [], 
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
      {statusMessage && (
        <div className={`mb-6 p-4 border ${
          statusMessage.type === 'success' 
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' 
            : 'border-red-500/50 bg-red-500/10 text-red-400'
        }`}>
          <p className="text-xs font-mono">{statusMessage.text}</p>
        </div>
      )}

      {/* Section 1: Premium Sources */}
      {/* ... Premium Sources code from above ... */}

      {/* Section 2: Response Triggers */}
      {/* ... Response Triggers code from above ... */}

      {/* Section 3: Research Monitoring */}
      {/* ... Research Monitoring code from above ... */}

      {/* Section 4: Bot Accounts */}
      {/* ... Bot Accounts code from above ... */}
    </div>
  );
}
```

---

## 🎨 Color Scheme Reference

### Status Colors
- **Active:** `text-emerald-500`, `bg-emerald-500`
- **Paused/Inactive:** `text-zinc-600`, `bg-zinc-600`
- **Premium Sources:** Emerald dot
- **Response Triggers:** Indigo dot (`bg-indigo-500`)
- **Research Monitoring:** Amber dot (`bg-amber-500`)
- **Delete Actions:** `text-red-500`, `hover:text-red-400`

### Border Colors
- **Default:** `border-zinc-800/50`, `border-white/10`
- **Hover:** `hover:border-white/30`, `hover:border-white/20`
- **Input Focus:** `focus:border-white/50`

### Background Colors
- **Input:** `bg-black/50`
- **List Items:** `bg-black`, `hover:bg-white/5`
- **Info Boxes:** `bg-black/30`
- **List Container:** `bg-zinc-900/30`

---

## 📱 Responsive Design

### Desktop (lg breakpoint and up)
- **Layout:** All sections stacked vertically
- **Grid:** Bot accounts in 2-column grid
- **Spacing:** `gap-6` between sections, `mb-12` for major sections

### Mobile (below lg breakpoint)
- **Layout:** Same vertical stack
- **Grid:** Bot accounts in 1 column
- **Spacing:** Reduced padding `p-6` instead of `p-8`

---

## ✨ Interaction Patterns

### Hover Effects
- **List Items:** `hover:bg-white/5` - subtle background change
- **Buttons:** `opacity-0 group-hover:opacity-100` - reveal on hover
- **Inputs:** `hover:border-white/30` - border highlight

### Loading States
- **Buttons:** Show `[ ... ]` when loading
- **Inputs:** `disabled:opacity-50` when processing
- **Prevent Double-clicks:** Disable buttons during operations

### Confirmation Dialogs
- **Delete Actions:** `window.confirm()` before deletion
- **Format:** "Are you sure you want to delete {handle}?"

### Inline Editing
- **Posts Count:** Click to edit, Enter to save, Escape to cancel
- **Visual:** Input appears inline, auto-focus
- **Validation:** Ensure >= 0

---

## 🔧 Handler Functions Needed

### Premium Sources
```typescript
const handleAddPremiumSource = async () => {
  // Add account with posts_to_generate
};

const handleDeletePremiumSource = async (handle: string) => {
  // Delete with confirmation
};

const handleUpdatePremiumPosts = async (handle: string, posts: number) => {
  // Update posts_to_generate
};
```

### Response Triggers
```typescript
const handleAddTrigger = async () => {
  // Add to monitoring.trigger_mentions
};

const handleDeleteTrigger = async (handle: string) => {
  // Delete from monitoring.trigger_mentions
};
```

### Research Monitoring
```typescript
const handleAddResearch = async () => {
  // Add to research_monitoring.target_accounts
};

const handleDeleteResearch = async (handle: string) => {
  // Delete from research_monitoring.target_accounts
};
```

---

## 📋 Implementation Checklist

### Backend Endpoints Needed
- [ ] `POST /api/accounts` - Enhance for premium sources (accept posts_to_generate)
- [ ] `DELETE /api/accounts` - Delete premium sources
- [ ] `PUT /api/accounts` - Update premium sources (posts_to_generate)
- [ ] `POST /api/response-triggers` - Add trigger
- [ ] `DELETE /api/response-triggers` - Delete trigger
- [ ] `GET /api/response-triggers` - Get triggers
- [ ] `POST /api/research-accounts` - Add research account
- [ ] `DELETE /api/research-accounts` - Delete research account
- [ ] `GET /api/research-accounts` - Get research accounts

### Frontend Components Needed
- [ ] Premium Sources section (enhance existing)
- [ ] Response Triggers section (new)
- [ ] Research Monitoring section (enhance existing)
- [ ] Bot Accounts section (enhance existing)
- [ ] Status message component
- [ ] Handler functions for all operations
- [ ] State management for all sections

### Features Needed
- [ ] Add account functionality
- [ ] Delete account functionality
- [ ] Update posts count (inline editing)
- [ ] Confirmation dialogs
- [ ] Loading states
- [ ] Error handling
- [ ] Success messages
- [ ] Empty states

---

## 🎯 Visual Hierarchy

### Section Order (Top to Bottom)
1. **Premium Sources** - Most important (post generation)
2. **Response Triggers** - Important (controls replies)
3. **Research Monitoring** - Secondary (intelligence gathering)
4. **Bot Accounts** - Reference (read-only)

### Visual Weight
- **Headers:** `text-xs` uppercase, wide tracking
- **Labels:** `text-[10px]` uppercase, zinc-600
- **Handles:** `text-sm` bold, white
- **Actions:** `text-[10px]` uppercase, hover reveal
- **Status:** `text-[10px]` uppercase, colored

---

## 📐 Spacing & Layout

### Section Spacing
- **Between sections:** `mb-12` (3rem / 48px)
- **Within sections:** `gap-6` (1.5rem / 24px)
- **List items:** `space-y-px` (1px gaps)

### Padding
- **Page container:** `p-8` (2rem / 32px)
- **Section containers:** No extra padding
- **List items:** `p-4` (1rem / 16px)
- **Inputs:** `p-4` (1rem / 16px)

### Max Width
- **Page:** `max-w-[1400px]` (wider than current 1200px for 4 sections)
- **Centered:** `mx-auto`

---

## 🎨 Typography Scale

### Headers
- **Page Title:** `text-sm` (14px) - `ADD ACCOUNTS`
- **Section Title:** `text-xs` (12px) - `PREMIUM_SOURCES`
- **Subtitle:** `text-[10px]` (10px) - `// POST GENERATION NODES`
- **List Header:** `text-[10px]` (10px) - `CONFIGURED_SOURCES`

### Content
- **Account Handle:** `text-sm` (14px) bold - `@bankrbot`
- **Status Text:** `text-[10px]` (10px) - `ACTIVE`
- **Button Text:** `text-[10px]` (10px) - `[ DELETE ]`
- **Info Text:** `text-[10px]` (10px) - Description text
- **Labels:** `text-[9px]` (9px) - Small labels

### Font Family
- **All:** `font-mono` (monospace)
- **Tracking:** `tracking-[0.2em]` for headers, `tracking-wider` for labels
- **Case:** `uppercase` for all UI text

---

## ✅ Summary

### Design Principles
1. **Consistent Theme:** Match existing dashboard style exactly
2. **Clear Hierarchy:** 4 distinct sections with clear purposes
3. **Visual Differentiation:** Color-coded status dots (emerald, indigo, amber)
4. **Hover Interactions:** Reveal actions on hover
5. **Terminal Aesthetic:** Monospace, uppercase, `>` prompts
6. **Minimal & Clean:** Lots of whitespace, subtle borders

### Key Features
- ✅ 4 distinct sections
- ✅ Add/Delete for all account types
- ✅ Inline editing for posts count
- ✅ Hover-reveal actions
- ✅ Empty states
- ✅ Status indicators
- ✅ Loading states
- ✅ Error handling
- ✅ Confirmation dialogs

### Ready for Implementation
This design specification provides complete code structure, styling, and interaction patterns matching your existing UI theme. All components are ready to be implemented following this exact structure.

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-20  
**Status:** Ready for Implementation



