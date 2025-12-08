# Account Management Feature - Complete Implementation Plan

## 📋 Table of Contents
1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Implementation Strategy](#implementation-strategy)
4. [File-by-File Changes](#file-by-file-changes)
5. [Detailed Code Examples](#detailed-code-examples)
6. [Step-by-Step Implementation](#step-by-step-implementation)
7. [Testing Strategy](#testing-strategy)
8. [Risk Mitigation](#risk-mitigation)
9. [Rollback Plan](#rollback-plan)

---

## Overview

### Goal
Enable users to add, delete, and update accounts (both premium sources and response targets) directly from the dashboard UI, including the ability to set `posts_to_generate` for premium sources.

### Constraints
- **Minimal code changes** - Enhance existing code, don't rewrite
- **No new files** - Modify existing files only
- **No database changes** - Use existing YAML file structure
- **Reuse existing patterns** - Follow current code style and patterns

### Files to Modify
1. `mvp/src/dashboard/server.ts` - Backend API endpoints
2. `mvp/dashboard-react/src/services/api.ts` - Frontend API client
3. `mvp/dashboard-react/src/App.tsx` - Frontend UI components

### Files NOT to Touch
- `mvp/config/target-accounts.yaml` - Structure stays same
- `mvp/config/accounts.yaml` - Structure stays same
- `mvp/src/services/targetAccountScraper.ts` - Reads YAML as-is
- All other files remain unchanged

---

## Current State Analysis

### Backend API (`mvp/src/dashboard/server.ts`)

#### Current POST Endpoint (Lines 533-639)
**Location:** `mvp/src/dashboard/server.ts:533-639`

**Current Functionality:**
- ✅ Accepts `handle` and `type` in request body
- ✅ Normalizes handle (adds @ if missing)
- ✅ Adds to `target-accounts.yaml` for type='target'
- ✅ Adds to `accounts.yaml` monitoring.target_accounts for type='source'
- ✅ Checks for duplicates
- ✅ Returns success/error response

**Current Limitations:**
- ❌ Doesn't accept `posts_to_generate` parameter
- ❌ No DELETE endpoint
- ❌ No PUT endpoint for updates
- ❌ No atomic file writes (risk of corruption)
- ❌ No backup before writes

**Current Code Structure:**
```typescript
app.post('/api/accounts', async (req, res) => {
  // Lines 534-639
  // Handles POST only
  // Writes directly to YAML without backup
  // Hardcoded posts_to_generate: 3 for targets
});
```

### Frontend API Client (`mvp/dashboard-react/src/services/api.ts`)

#### Current Functions
**Location:** `mvp/dashboard-react/src/services/api.ts:45-52`

**Current `addAccount` Function:**
```typescript
export const addAccount = async (handle: string, type: 'source' | 'target'): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, type })
    });
    if (!response.ok) throw new Error('Failed to add account');
};
```

**Current Limitations:**
- ❌ Doesn't accept `posts_to_generate` parameter
- ❌ No `deleteAccount` function
- ❌ No `updateAccount` function

### Frontend UI (`mvp/dashboard-react/src/App.tsx`)

#### Current Accounts View (Lines 400-550)
**Location:** `mvp/dashboard-react/src/App.tsx:400-550`

**Current State:**
- ✅ UI exists with input fields
- ✅ Shows existing accounts
- ✅ Has [ADD] buttons
- ❌ Inputs not connected to state
- ❌ Buttons don't have handlers
- ❌ No delete functionality
- ❌ No posts_to_generate input
- ❌ No update functionality

**Current UI Structure:**
```typescript
// Lines 444-466: Source account input (not connected)
<input 
  type="text" 
  value={sourceHandle}  // State exists but not used properly
  onChange={(e) => setSourceHandle(e.target.value)}
  // ... no posts_to_generate input
/>

// Lines 480-492: Source accounts list (read-only)
{data.accounts.filter((acc: any) => acc.type === 'source').map((acc: any) => (
  <div key={acc.id}>
    {/* No delete button, no edit button */}
  </div>
))}
```

### YAML File Structure

#### `target-accounts.yaml` Structure
**Location:** `mvp/config/target-accounts.yaml`

**Current Structure:**
```yaml
target_accounts:
  - handle: "@bankrbot"
    category: "airdrop_farming"
    niche: "airdrop_farming"
    weight: 1.0
    scrape_replies: true
    scrape_limit: 30
    enabled: true
    note: "Premium target for @pelpa333 airdrop farming"
    url: "https://x.com/bankrbot"
    posts_to_generate: 2  # ✅ This field exists!
```

**Key Points:**
- ✅ `posts_to_generate` field already exists
- ✅ Structure is well-defined
- ✅ All accounts have same structure

#### `accounts.yaml` Structure
**Location:** `mvp/config/accounts.yaml`

**Current Structure:**
```yaml
monitoring:
  target_accounts: ["@bankrbot", "@trylimitless"]  # Source accounts as strings
```

**Key Points:**
- ⚠️ Source accounts stored as simple string array
- ⚠️ No `posts_to_generate` field for sources
- ⚠️ Different structure than target-accounts.yaml

---

## Implementation Strategy

### Data Model Decision

**Decision: Use existing structure with enhancements**

#### Premium Sources (type='source')
- **Storage:** `accounts.yaml` → `research_monitoring.target_accounts`
- **Current:** Array of strings `["@bankrbot", "@trylimitless"]`
- **Enhancement:** Keep as strings (simpler, matches current scraper expectations)
- **Note:** Premium sources don't need `posts_to_generate` - they're monitored, not generated from

#### Response Targets (type='target')
- **Storage:** `target-accounts.yaml` → `target_accounts` array
- **Current:** Array of objects with `posts_to_generate` field
- **Enhancement:** Accept `posts_to_generate` in POST, allow updates via PUT

### API Endpoint Strategy

**Single Endpoint, Multiple Methods:**
- `POST /api/accounts` - Add account (enhance existing)
- `DELETE /api/accounts` - Delete account (add new)
- `PUT /api/accounts` - Update account (add new)

**Why Single Endpoint:**
- Matches RESTful pattern
- Easier to maintain
- Consistent error handling

---

## File-by-File Changes

### File 1: `mvp/src/dashboard/server.ts`

#### Change 1: Add Helper Functions (Before POST endpoint)

**Location:** Add after line 532, before line 533

**Purpose:** Reusable functions for YAML operations

**Code to Add:**
```typescript
// Helper function to normalize handle
function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.startsWith('@') ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

// Helper function to safely write YAML with backup
function safeWriteYAML(filePath: string, data: any): void {
  // Create backup
  const backupPath = `${filePath}.backup`;
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath);
  }
  
  // Write to temp file first (atomic write)
  const tempPath = `${filePath}.tmp`;
  const yamlString = yaml.stringify(data, { 
    indent: 2,
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE'
  });
  
  fs.writeFileSync(tempPath, yamlString, 'utf8');
  
  // Validate YAML by parsing it back
  try {
    const testParse = yaml.parse(fs.readFileSync(tempPath, 'utf8'));
    // If validation passes, rename temp to actual file (atomic)
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // If validation fails, restore backup and throw
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
    }
    throw new Error(`Invalid YAML generated: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to get config directory path
function getConfigDir(): string {
  return fs.existsSync(path.join(process.cwd(), 'config'))
    ? path.join(process.cwd(), 'config')
    : path.join(process.cwd(), 'mvp', 'config');
}
```

#### Change 2: Enhance POST Endpoint

**Location:** `mvp/src/dashboard/server.ts:533-639`

**Current Code:** Lines 533-639 (entire POST handler)

**Changes Needed:**
1. Accept `posts_to_generate` in request body
2. Use helper functions
3. Use safe YAML write

**New Code:**
```typescript
app.post('/api/accounts', async (req, res) => {
  try {
    const { handle, type, posts_to_generate } = req.body;
    
    if (!handle || !type) {
      return res.status(400).json({ error: 'handle and type are required' });
    }

    if (type !== 'source' && type !== 'target') {
      return res.status(400).json({ error: 'type must be "source" or "target"' });
    }

    const normalizedHandle = normalizeHandle(handle);
    const configDir = getConfigDir();
    
    if (type === 'target') {
      // Add to target-accounts.yaml
      const configPath = path.join(configDir, 'target-accounts.yaml');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'target-accounts.yaml not found' });
      }

      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);

      // Check if account already exists
      const existingAccounts = config.target_accounts || [];
      if (existingAccounts.some((acc: any) => acc.handle?.toLowerCase() === normalizedHandle.toLowerCase())) {
        return res.status(400).json({ error: `Account ${normalizedHandle} already exists` });
      }

      // Add new account with provided or default values
      const newAccount = {
        handle: normalizedHandle,
        category: 'airdrop_farming',
        niche: 'airdrop_farming',
        weight: 1.0,
        scrape_replies: true,
        scrape_limit: 30,
        enabled: true,
        note: `Added via dashboard`,
        url: `https://x.com/${normalizedHandle.replace('@', '')}`,
        posts_to_generate: typeof posts_to_generate === 'number' && posts_to_generate >= 0 
          ? posts_to_generate 
          : 2  // Default to 2 if not provided or invalid
      };

      config.target_accounts = [...existingAccounts, newAccount];

      // Use safe write function
      safeWriteYAML(configPath, config);

      console.log(`✅ Added target account: ${normalizedHandle} with ${newAccount.posts_to_generate} posts`);
      return res.json({ 
        success: true, 
        message: `Successfully added target account ${normalizedHandle}`,
        account: newAccount
      });

    } else {
      // For source accounts, add to research_monitoring.target_accounts in accounts.yaml
      const configPath = path.join(configDir, 'accounts.yaml');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'accounts.yaml not found' });
      }

      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);

      // Initialize research_monitoring if it doesn't exist
      if (!config.research_monitoring) {
        config.research_monitoring = { target_accounts: [] };
      }

      // Check if account already exists
      const targetAccounts = config.research_monitoring.target_accounts || [];
      if (targetAccounts.includes(normalizedHandle)) {
        return res.status(400).json({ error: `Source account ${normalizedHandle} already exists` });
      }

      // Add to research_monitoring.target_accounts
      config.research_monitoring.target_accounts = [...targetAccounts, normalizedHandle];

      // Use safe write function
      safeWriteYAML(configPath, config);

      console.log(`✅ Added source account: ${normalizedHandle}`);
      return res.json({ 
        success: true, 
        message: `Successfully added source account ${normalizedHandle}`,
        account: { handle: normalizedHandle, type: 'source' }
      });
    }

  } catch (error) {
    console.error('Add account error:', error);
    return res.status(500).json({ 
      error: `Failed to add account: ${error instanceof Error ? error.message : 'Unknown error'}` 
    });
  }
});
```

#### Change 3: Add DELETE Endpoint

**Location:** Add after POST endpoint, before line 641

**Code to Add:**
```typescript
app.delete('/api/accounts', async (req, res) => {
  try {
    const { handle, type } = req.body;
    
    if (!handle || !type) {
      return res.status(400).json({ error: 'handle and type are required' });
    }

    if (type !== 'source' && type !== 'target') {
      return res.status(400).json({ error: 'type must be "source" or "target"' });
    }

    const normalizedHandle = normalizeHandle(handle);
    const configDir = getConfigDir();
    
    if (type === 'target') {
      // Delete from target-accounts.yaml
      const configPath = path.join(configDir, 'target-accounts.yaml');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'target-accounts.yaml not found' });
      }

      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);

      const existingAccounts = config.target_accounts || [];
      const accountIndex = existingAccounts.findIndex(
        (acc: any) => acc.handle?.toLowerCase() === normalizedHandle.toLowerCase()
      );

      if (accountIndex === -1) {
        return res.status(404).json({ error: `Account ${normalizedHandle} not found` });
      }

      // Remove account
      config.target_accounts = existingAccounts.filter(
        (_: any, index: number) => index !== accountIndex
      );

      // Use safe write function
      safeWriteYAML(configPath, config);

      console.log(`✅ Deleted target account: ${normalizedHandle}`);
      return res.json({ 
        success: true, 
        message: `Successfully deleted target account ${normalizedHandle}` 
      });

    } else {
      // Delete from accounts.yaml research_monitoring.target_accounts
      const configPath = path.join(configDir, 'accounts.yaml');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'accounts.yaml not found' });
      }

      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);

      if (!config.research_monitoring?.target_accounts) {
        return res.status(404).json({ error: `Source account ${normalizedHandle} not found` });
      }

      const targetAccounts = config.research_monitoring.target_accounts;
      const accountIndex = targetAccounts.findIndex(
        (acc: string) => acc.toLowerCase() === normalizedHandle.toLowerCase()
      );

      if (accountIndex === -1) {
        return res.status(404).json({ error: `Source account ${normalizedHandle} not found` });
      }

      // Remove account
      config.research_monitoring.target_accounts = targetAccounts.filter(
        (_: string, index: number) => index !== accountIndex
      );

      // Use safe write function
      safeWriteYAML(configPath, config);

      console.log(`✅ Deleted source account: ${normalizedHandle}`);
      return res.json({ 
        success: true, 
        message: `Successfully deleted source account ${normalizedHandle}` 
      });
    }

  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ 
      error: `Failed to delete account: ${error instanceof Error ? error.message : 'Unknown error'}` 
    });
  }
});
```

#### Change 4: Add PUT Endpoint

**Location:** Add after DELETE endpoint, before line 641

**Code to Add:**
```typescript
app.put('/api/accounts', async (req, res) => {
  try {
    const { handle, type, updates } = req.body;
    
    if (!handle || !type || !updates) {
      return res.status(400).json({ error: 'handle, type, and updates are required' });
    }

    if (type !== 'source' && type !== 'target') {
      return res.status(400).json({ error: 'type must be "source" or "target"' });
    }

    const normalizedHandle = normalizeHandle(handle);
    const configDir = getConfigDir();
    
    if (type === 'target') {
      // Update in target-accounts.yaml
      const configPath = path.join(configDir, 'target-accounts.yaml');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'target-accounts.yaml not found' });
      }

      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);

      const existingAccounts = config.target_accounts || [];
      const accountIndex = existingAccounts.findIndex(
        (acc: any) => acc.handle?.toLowerCase() === normalizedHandle.toLowerCase()
      );

      if (accountIndex === -1) {
        return res.status(404).json({ error: `Account ${normalizedHandle} not found` });
      }

      // Update allowed fields
      const account = existingAccounts[accountIndex];
      if (updates.posts_to_generate !== undefined) {
        account.posts_to_generate = typeof updates.posts_to_generate === 'number' && updates.posts_to_generate >= 0
          ? updates.posts_to_generate
          : account.posts_to_generate;
      }
      if (updates.enabled !== undefined) {
        account.enabled = Boolean(updates.enabled);
      }

      // Use safe write function
      safeWriteYAML(configPath, config);

      console.log(`✅ Updated target account: ${normalizedHandle}`, updates);
      return res.json({ 
        success: true, 
        message: `Successfully updated target account ${normalizedHandle}`,
        account: account
      });

    } else {
      // Source accounts are simple strings, so updates are limited
      // For now, we'll just return an error explaining source accounts can't be updated
      // (They're just handles in an array, no fields to update)
      return res.status(400).json({ 
        error: 'Source accounts cannot be updated. Delete and re-add if needed.' 
      });
    }

  } catch (error) {
    console.error('Update account error:', error);
    return res.status(500).json({ 
      error: `Failed to update account: ${error instanceof Error ? error.message : 'Unknown error'}` 
    });
  }
});
```

### File 2: `mvp/dashboard-react/src/services/api.ts`

#### Change 1: Enhance addAccount Function

**Location:** `mvp/dashboard-react/src/services/api.ts:45-52`

**Current Code:**
```typescript
export const addAccount = async (handle: string, type: 'source' | 'target'): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, type })
    });
    if (!response.ok) throw new Error('Failed to add account');
};
```

**New Code:**
```typescript
export const addAccount = async (
    handle: string, 
    type: 'source' | 'target', 
    posts_to_generate?: number
): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            handle, 
            type,
            ...(posts_to_generate !== undefined && { posts_to_generate })
        })
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to add account' }));
        throw new Error(error.error || 'Failed to add account');
    }
};
```

#### Change 2: Add deleteAccount Function

**Location:** Add after `addAccount` function

**Code to Add:**
```typescript
export const deleteAccount = async (handle: string, type: 'source' | 'target'): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/accounts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, type })
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete account' }));
        throw new Error(error.error || 'Failed to delete account');
    }
};
```

#### Change 3: Add updateAccount Function

**Location:** Add after `deleteAccount` function

**Code to Add:**
```typescript
export const updateAccount = async (
    handle: string, 
    type: 'source' | 'target', 
    updates: { posts_to_generate?: number; enabled?: boolean }
): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, type, updates })
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to update account' }));
        throw new Error(error.error || 'Failed to update account');
    }
};
```

### File 3: `mvp/dashboard-react/src/App.tsx`

#### Change 1: Add State Variables

**Location:** Find state declarations (around line 30-50)

**Current State:**
```typescript
const [sourceHandle, setSourceHandle] = useState('');
const [targetHandle, setTargetHandle] = useState('');
const [addingAccount, setAddingAccount] = useState(false);
const [addAccountMessage, setAddAccountMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
```

**Add New State:**
```typescript
const [sourcePosts, setSourcePosts] = useState<number>(2);  // For posts_to_generate
const [updatingAccount, setUpdatingAccount] = useState<string | null>(null);  // Track which account is being updated
const [deletingAccount, setDeletingAccount] = useState<string | null>(null);  // Track which account is being deleted
```

#### Change 2: Update handleAddAccount Function

**Location:** Find `handleAddAccount` function (around line 350-400)

**Current Code:**
```typescript
const handleAddAccount = async (handle: string, type: 'source' | 'target') => {
    // ... existing code
};
```

**New Code:**
```typescript
const handleAddAccount = async (handle: string, type: 'source' | 'target') => {
    if (!handle.trim()) {
        setAddAccountMessage({ type: 'error', text: 'Handle cannot be empty' });
        return;
    }

    setAddingAccount(true);
    setAddAccountMessage(null);

    try {
        if (type === 'source') {
            await addAccount(handle, 'source');
            setSourceHandle('');
            setSourcePosts(2);  // Reset to default
        } else {
            await addAccount(handle, 'target', sourcePosts);
            setTargetHandle('');
            setSourcePosts(2);  // Reset to default
        }
        
        setAddAccountMessage({ type: 'success', text: `Successfully added ${type} account ${handle}` });
        await refreshData();  // Refresh to show new account
    } catch (error) {
        setAddAccountMessage({ 
            type: 'error', 
            text: error instanceof Error ? error.message : 'Failed to add account' 
        });
    } finally {
        setAddingAccount(false);
    }
};
```

#### Change 3: Add handleDeleteAccount Function

**Location:** Add after `handleAddAccount` function

**Code to Add:**
```typescript
const handleDeleteAccount = async (handle: string, type: 'source' | 'target') => {
    if (!window.confirm(`Are you sure you want to delete ${handle}?`)) {
        return;
    }

    setDeletingAccount(handle);
    setAddAccountMessage(null);

    try {
        await deleteAccount(handle, type);
        setAddAccountMessage({ type: 'success', text: `Successfully deleted ${type} account ${handle}` });
        await refreshData();  // Refresh to remove deleted account
    } catch (error) {
        setAddAccountMessage({ 
            type: 'error', 
            text: error instanceof Error ? error.message : 'Failed to delete account' 
        });
    } finally {
        setDeletingAccount(null);
    }
};
```

#### Change 4: Add handleUpdatePosts Function

**Location:** Add after `handleDeleteAccount` function

**Code to Add:**
```typescript
const handleUpdatePosts = async (handle: string, posts: number) => {
    if (posts < 0) {
        setAddAccountMessage({ type: 'error', text: 'Posts to generate must be >= 0' });
        return;
    }

    setUpdatingAccount(handle);
    setAddAccountMessage(null);

    try {
        await updateAccount(handle, 'target', { posts_to_generate: posts });
        setAddAccountMessage({ type: 'success', text: `Updated ${handle} to generate ${posts} posts` });
        await refreshData();  // Refresh to show updated value
    } catch (error) {
        setAddAccountMessage({ 
            type: 'error', 
            text: error instanceof Error ? error.message : 'Failed to update account' 
        });
    } finally {
        setUpdatingAccount(null);
    }
};
```

#### Change 5: Update Source Account Input UI

**Location:** `mvp/dashboard-react/src/App.tsx:444-466`

**Current Code:**
```typescript
<div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
  <span className="text-zinc-500 font-mono">{'>'}</span>
  <input 
    type="text" 
    value={sourceHandle}
    onChange={(e) => setSourceHandle(e.target.value)}
    // ... no posts input
  />
  <button onClick={() => handleAddAccount(sourceHandle, 'source')}>
    [ ADD ]
  </button>
</div>
```

**New Code:**
```typescript
<div className="flex flex-col gap-3">
  <div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
    <span className="text-zinc-500 font-mono">{'>'}</span>
    <input 
      type="text" 
      value={sourceHandle}
      onChange={(e) => setSourceHandle(e.target.value)}
      onKeyPress={(e) => {
        if (e.key === 'Enter' && !addingAccount && sourceHandle.trim()) {
          handleAddAccount(sourceHandle, 'source');
        }
      }}
      placeholder="ADD_SOURCE_HANDLE" 
      disabled={addingAccount}
      className="bg-transparent w-full font-mono text-xs text-white focus:outline-none placeholder:text-zinc-700 uppercase disabled:opacity-50"
    />
    <button 
      onClick={() => handleAddAccount(sourceHandle, 'source')}
      disabled={addingAccount || !sourceHandle.trim()}
      className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {addingAccount ? '[ ... ]' : '[ ADD ]'}
    </button>
  </div>
</div>
```

#### Change 6: Update Target Account Input UI (Add Posts Input)

**Location:** `mvp/dashboard-react/src/App.tsx:509-531`

**Current Code:**
```typescript
<div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
  <span className="text-zinc-500 font-mono">{'>'}</span>
  <input 
    type="text" 
    value={targetHandle}
    // ... no posts input
  />
  <button onClick={() => handleAddAccount(targetHandle, 'target')}>
    [ ADD ]
  </button>
</div>
```

**New Code:**
```typescript
<div className="flex flex-col gap-3">
  <div className="group flex items-center gap-3 p-4 border border-zinc-800 bg-black/50 hover:border-white/30 transition-colors">
    <span className="text-zinc-500 font-mono">{'>'}</span>
    <input 
      type="text" 
      value={targetHandle}
      onChange={(e) => setTargetHandle(e.target.value)}
      onKeyPress={(e) => {
        if (e.key === 'Enter' && !addingAccount && targetHandle.trim()) {
          handleAddAccount(targetHandle, 'target');
        }
      }}
      placeholder="ADD_TARGET_HANDLE" 
      disabled={addingAccount}
      className="bg-transparent w-full font-mono text-xs text-white focus:outline-none placeholder:text-zinc-700 uppercase disabled:opacity-50"
    />
    <button 
      onClick={() => handleAddAccount(targetHandle, 'target')}
      disabled={addingAccount || !targetHandle.trim()}
      className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {addingAccount ? '[ ... ]' : '[ ADD ]'}
    </button>
  </div>
  
  {/* Posts to Generate Input */}
  <div className="group flex items-center gap-3 p-3 border border-zinc-800/50 bg-black/30">
    <span className="text-[10px] font-mono text-zinc-600 uppercase">POSTS:</span>
    <input 
      type="number" 
      min="0"
      value={sourcePosts}
      onChange={(e) => setSourcePosts(parseInt(e.target.value) || 0)}
      disabled={addingAccount}
      className="bg-transparent w-20 font-mono text-xs text-white focus:outline-none border border-zinc-800 px-2 py-1 disabled:opacity-50"
    />
    <span className="text-[10px] font-mono text-zinc-600">posts to generate</span>
  </div>
</div>
```

#### Change 7: Update Source Accounts List (Add Delete Button)

**Location:** `mvp/dashboard-react/src/App.tsx:480-492`

**Current Code:**
```typescript
{data.accounts.filter((acc: any) => acc.type === 'source').map((acc: any) => (
  <div key={acc.id} className="flex items-center justify-between p-3 border border-zinc-800/50 bg-black/30">
    <span className="text-xs font-mono text-zinc-400">{acc.handle}</span>
    <span className={`text-[10px] font-mono uppercase ${
      acc.status === 'active' ? 'text-emerald-500' : 'text-zinc-600'
    }`}>
      {acc.status}
    </span>
  </div>
))}
```

**New Code:**
```typescript
{data.accounts.filter((acc: any) => acc.type === 'source').map((acc: any) => (
  <div key={acc.id} className="flex items-center justify-between p-3 border border-zinc-800/50 bg-black/30 group hover:border-white/20 transition-colors">
    <span className="text-xs font-mono text-zinc-400">{acc.handle}</span>
    <div className="flex items-center gap-3">
      <span className={`text-[10px] font-mono uppercase ${
        acc.status === 'active' ? 'text-emerald-500' : 'text-zinc-600'
      }`}>
        {acc.status}
      </span>
      <button
        onClick={() => handleDeleteAccount(acc.handle, 'source')}
        disabled={deletingAccount === acc.handle}
        className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {deletingAccount === acc.handle ? '[ ... ]' : '[ DELETE ]'}
      </button>
    </div>
  </div>
))}
```

#### Change 8: Update Target Accounts List (Add Delete + Posts Edit)

**Location:** `mvp/dashboard-react/src/App.tsx:545-550`

**Current Code:**
```typescript
{data.accounts.filter((acc: any) => acc.type === 'target').map((acc: any) => (
  <div key={acc.id} className="flex items-center justify-between p-3 border border-zinc-800/50 bg-black/30">
    <span className="text-xs font-mono text-zinc-400">{acc.handle}</span>
    <div className="flex items-center gap-3">
      <span className={`text-[10px] font-mono uppercase ${
        acc.status === 'active' ? 'text-indigo-500' : 'text-zinc-600'
      }`}>
        {acc.status}
      </span>
    </div>
  </div>
))}
```

**New Code:**
```typescript
{data.accounts.filter((acc: any) => acc.type === 'target').map((acc: any) => {
  // Get posts_to_generate from account metadata or default to 0
  const currentPosts = (acc as any).posts_to_generate ?? 0;
  const [editingPosts, setEditingPosts] = useState(false);
  const [tempPosts, setTempPosts] = useState(currentPosts);
  
  return (
    <div key={acc.id} className="flex items-center justify-between p-3 border border-zinc-800/50 bg-black/30 group hover:border-white/20 transition-colors">
      <span className="text-xs font-mono text-zinc-400">{acc.handle}</span>
      <div className="flex items-center gap-3">
        {/* Posts to Generate - Editable */}
        {editingPosts ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={tempPosts}
              onChange={(e) => setTempPosts(parseInt(e.target.value) || 0)}
              onBlur={() => {
                if (tempPosts !== currentPosts) {
                  handleUpdatePosts(acc.handle, tempPosts);
                }
                setEditingPosts(false);
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  if (tempPosts !== currentPosts) {
                    handleUpdatePosts(acc.handle, tempPosts);
                  }
                  setEditingPosts(false);
                } else if (e.key === 'Escape') {
                  setTempPosts(currentPosts);
                  setEditingPosts(false);
                }
              }}
              autoFocus
              className="bg-black border border-zinc-700 text-white text-xs font-mono w-16 px-2 py-1 focus:outline-none focus:border-white/50"
            />
            <span className="text-[9px] font-mono text-zinc-600">posts</span>
          </div>
        ) : (
          <button
            onClick={() => setEditingPosts(true)}
            disabled={updatingAccount === acc.handle}
            className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          >
            {currentPosts} posts
          </button>
        )}
        
        <span className={`text-[10px] font-mono uppercase ${
          acc.status === 'active' ? 'text-indigo-500' : 'text-zinc-600'
        }`}>
          {acc.status}
        </span>
        
        <button
          onClick={() => handleDeleteAccount(acc.handle, 'target')}
          disabled={deletingAccount === acc.handle}
          className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deletingAccount === acc.handle ? '[ ... ]' : '[ DELETE ]'}
        </button>
      </div>
    </div>
  );
})}
```

**Note:** The inline editing with `useState` in map won't work directly. We need to create a separate component or use a different approach. See "Alternative Approach" below.

#### Alternative Approach for Inline Editing

**Create a separate component or use a map with IDs:**

**Better Approach - Use Account ID as key for editing state:**
```typescript
// Add to state declarations
const [editingPosts, setEditingPosts] = useState<Record<string, number>>({});

// In the map function:
{data.accounts.filter((acc: any) => acc.type === 'target').map((acc: any) => {
  const currentPosts = (acc as any).posts_to_generate ?? 0;
  const isEditing = editingPosts[acc.id] !== undefined;
  const tempPosts = isEditing ? editingPosts[acc.id] : currentPosts;
  
  return (
    <div key={acc.id} className="flex items-center justify-between p-3 border border-zinc-800/50 bg-black/30 group hover:border-white/20 transition-colors">
      <span className="text-xs font-mono text-zinc-400">{acc.handle}</span>
      <div className="flex items-center gap-3">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={tempPosts}
              onChange={(e) => setEditingPosts({ ...editingPosts, [acc.id]: parseInt(e.target.value) || 0 })}
              onBlur={() => {
                if (tempPosts !== currentPosts) {
                  handleUpdatePosts(acc.handle, tempPosts);
                }
                const newEditing = { ...editingPosts };
                delete newEditing[acc.id];
                setEditingPosts(newEditing);
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  if (tempPosts !== currentPosts) {
                    handleUpdatePosts(acc.handle, tempPosts);
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
            onClick={() => setEditingPosts({ ...editingPosts, [acc.id]: currentPosts })}
            disabled={updatingAccount === acc.handle}
            className="text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          >
            {currentPosts} posts
          </button>
        )}
        
        <span className={`text-[10px] font-mono uppercase ${
          acc.status === 'active' ? 'text-indigo-500' : 'text-zinc-600'
        }`}>
          {acc.status}
        </span>
        
        <button
          onClick={() => handleDeleteAccount(acc.handle, 'target')}
          disabled={deletingAccount === acc.handle}
          className="text-[10px] font-mono text-red-500 hover:text-red-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deletingAccount === acc.handle ? '[ ... ]' : '[ DELETE ]'}
        </button>
      </div>
    </div>
  );
})}
```

---

## Step-by-Step Implementation

### Phase 1: Backend Foundation

#### Step 1.1: Add Helper Functions
1. Open `mvp/src/dashboard/server.ts`
2. Find line 532 (before `app.post('/api/accounts'`)
3. Add helper functions (`normalizeHandle`, `safeWriteYAML`, `getConfigDir`)
4. Save file

#### Step 1.2: Enhance POST Endpoint
1. Find `app.post('/api/accounts'` (line 533)
2. Replace entire handler (lines 533-639) with enhanced version
3. Test with curl:
   ```bash
   curl -X POST http://localhost:3001/api/accounts \
     -H "Content-Type: application/json" \
     -d '{"handle": "@testaccount", "type": "target", "posts_to_generate": 5}'
   ```

#### Step 1.3: Add DELETE Endpoint
1. After POST endpoint (before line 641)
2. Add DELETE handler code
3. Test with curl:
   ```bash
   curl -X DELETE http://localhost:3001/api/accounts \
     -H "Content-Type: application/json" \
     -d '{"handle": "@testaccount", "type": "target"}'
   ```

#### Step 1.4: Add PUT Endpoint
1. After DELETE endpoint (before line 641)
2. Add PUT handler code
3. Test with curl:
   ```bash
   curl -X PUT http://localhost:3001/api/accounts \
     -H "Content-Type: application/json" \
     -d '{"handle": "@testaccount", "type": "target", "updates": {"posts_to_generate": 10}}'
   ```

### Phase 2: Frontend API Layer

#### Step 2.1: Enhance addAccount Function
1. Open `mvp/dashboard-react/src/services/api.ts`
2. Find `addAccount` function (line 45)
3. Replace with enhanced version (adds `posts_to_generate` parameter)
4. Save file

#### Step 2.2: Add deleteAccount Function
1. After `addAccount` function
2. Add `deleteAccount` function
3. Save file

#### Step 2.3: Add updateAccount Function
1. After `deleteAccount` function
2. Add `updateAccount` function
3. Save file

### Phase 3: Frontend UI

#### Step 3.1: Add State Variables
1. Open `mvp/dashboard-react/src/App.tsx`
2. Find state declarations (around line 30-50)
3. Add new state variables:
   - `sourcePosts`
   - `updatingAccount`
   - `deletingAccount`
   - `editingPosts`
4. Save file

#### Step 3.2: Update Handler Functions
1. Find `handleAddAccount` function
2. Replace with enhanced version
3. Add `handleDeleteAccount` function
4. Add `handleUpdatePosts` function
5. Save file

#### Step 3.3: Update Source Account UI
1. Find source account input section (around line 444)
2. Update input to use proper handlers
3. Save file

#### Step 3.4: Update Target Account UI
1. Find target account input section (around line 509)
2. Add posts_to_generate input
3. Update handlers
4. Save file

#### Step 3.5: Update Account Lists
1. Find source accounts list (around line 480)
2. Add delete button
3. Find target accounts list (around line 545)
4. Add delete button and posts editing
5. Save file

### Phase 4: Testing

#### Step 4.1: Test Backend Endpoints
1. Start backend: `cd mvp && npm run dashboard`
2. Test POST with curl (see Step 1.2)
3. Test DELETE with curl (see Step 1.3)
4. Test PUT with curl (see Step 1.4)
5. Verify YAML files updated correctly

#### Step 4.2: Test Frontend
1. Start frontend: `cd mvp/dashboard-react && npm run dev`
2. Navigate to Accounts tab
3. Test adding source account
4. Test adding target account with posts count
5. Test deleting account
6. Test updating posts count
7. Verify UI updates correctly

#### Step 4.3: Integration Test
1. Add account via UI
2. Check YAML file updated
3. Refresh dashboard
4. Verify account appears
5. Delete account via UI
6. Check YAML file updated
7. Refresh dashboard
8. Verify account removed

---

## Testing Strategy

### Unit Tests (Manual)

#### Backend API Tests
```bash
# Test 1: Add target account with posts_to_generate
curl -X POST http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"handle": "testaccount", "type": "target", "posts_to_generate": 5}'

# Expected: Success, account added to target-accounts.yaml with posts_to_generate: 5

# Test 2: Add target account without posts_to_generate
curl -X POST http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"handle": "testaccount2", "type": "target"}'

# Expected: Success, account added with default posts_to_generate: 2

# Test 3: Add duplicate account
curl -X POST http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"handle": "@testaccount", "type": "target"}'

# Expected: Error 400, "Account already exists"

# Test 4: Delete account
curl -X DELETE http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"handle": "@testaccount", "type": "target"}'

# Expected: Success, account removed from target-accounts.yaml

# Test 5: Update account posts_to_generate
curl -X PUT http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"handle": "@testaccount2", "type": "target", "updates": {"posts_to_generate": 10}}'

# Expected: Success, posts_to_generate updated to 10

# Test 6: Add source account
curl -X POST http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"handle": "sourcetest", "type": "source"}'

# Expected: Success, account added to accounts.yaml research_monitoring.target_accounts
```

### Frontend Tests (Manual)

#### Test Cases
1. **Add Source Account**
   - Enter handle: `@testsource`
   - Click [ADD]
   - Expected: Account appears in list, success message shown

2. **Add Target Account with Posts**
   - Enter handle: `@testtarget`
   - Set posts: `5`
   - Click [ADD]
   - Expected: Account appears in list with "5 posts", success message shown

3. **Delete Account**
   - Hover over account
   - Click [DELETE]
   - Confirm deletion
   - Expected: Account removed from list, success message shown

4. **Update Posts Count**
   - Hover over target account
   - Click on posts number
   - Enter new value: `10`
   - Press Enter
   - Expected: Posts count updated, success message shown

5. **Error Handling**
   - Try to add duplicate account
   - Expected: Error message shown
   - Try to add empty handle
   - Expected: Error message shown

### Integration Tests

#### Test Flow 1: Complete Add-Update-Delete Cycle
1. Add account via UI
2. Verify in YAML file
3. Update posts count via UI
4. Verify in YAML file
5. Delete account via UI
6. Verify removed from YAML file

#### Test Flow 2: Scraper Integration
1. Add account via UI
2. Run premium generator: `npm run cli swarm premium-standalone`
3. Verify scraper uses new account
4. Verify posts generated

---

## Risk Mitigation

### Risk 1: YAML File Corruption

**Mitigation:**
- Use `safeWriteYAML` function with backup
- Atomic writes (temp file + rename)
- Validation after write
- Automatic rollback on validation failure

**Recovery:**
- Backup files created automatically (`.backup` extension)
- Can manually restore from backup if needed

### Risk 2: Concurrent Writes

**Mitigation:**
- Single-user assumption (add locking later if needed)
- File system handles concurrent writes (last write wins)
- Backup provides safety net

**Future Enhancement:**
- Add file locking if multi-user needed
- Use database instead of YAML for production

### Risk 3: Invalid Handle Format

**Mitigation:**
- Normalize handles automatically
- Validate format in backend
- Return clear error messages

### Risk 4: Account Deleted While Scraping

**Mitigation:**
- Scraper checks account exists before scraping
- Graceful handling (skip deleted accounts)
- No crash if account missing

**Future Enhancement:**
- Check for active scrapes before delete
- Warn user if account in use

### Risk 5: Frontend-Backend Mismatch

**Mitigation:**
- Consistent error handling
- Clear error messages
- TypeScript types for type safety

---

## Rollback Plan

### If Issues Occur

#### Step 1: Stop Servers
```bash
# Stop backend (Ctrl+C)
# Stop frontend (Ctrl+C)
```

#### Step 2: Restore YAML Files
```bash
# Restore from backup
cd mvp/config
cp target-accounts.yaml.backup target-accounts.yaml
cp accounts.yaml.backup accounts.yaml
```

#### Step 3: Revert Code Changes
```bash
# Git revert
git checkout HEAD -- mvp/src/dashboard/server.ts
git checkout HEAD -- mvp/dashboard-react/src/services/api.ts
git checkout HEAD -- mvp/dashboard-react/src/App.tsx
```

#### Step 4: Restart Servers
```bash
# Restart backend
cd mvp && npm run dashboard

# Restart frontend
cd mvp/dashboard-react && npm run dev
```

---

## Summary

### Files Modified: 3
1. `mvp/src/dashboard/server.ts` - ~200 lines added/modified
2. `mvp/dashboard-react/src/services/api.ts` - ~40 lines added
3. `mvp/dashboard-react/src/App.tsx` - ~100 lines added/modified

### Total Lines Changed: ~340 lines

### New Features Added
- ✅ Add accounts with `posts_to_generate` parameter
- ✅ Delete accounts
- ✅ Update `posts_to_generate` for target accounts
- ✅ Safe YAML writes with backup
- ✅ Atomic file operations
- ✅ Better error handling
- ✅ Loading states in UI
- ✅ Confirmation dialogs

### No Breaking Changes
- ✅ Existing code continues to work
- ✅ YAML structure unchanged
- ✅ Scraper code unchanged
- ✅ Backward compatible

---

## Next Steps After Implementation

1. **Test thoroughly** - Run all test cases
2. **Monitor for errors** - Check logs for issues
3. **Gather feedback** - Get user feedback on UX
4. **Iterate** - Make improvements based on feedback
5. **Document** - Update user documentation

---

## Questions or Issues?

If you encounter any issues during implementation:
1. Check error messages in browser console
2. Check backend logs
3. Verify YAML file structure
4. Test with curl to isolate frontend vs backend issues
5. Check backup files if YAML corrupted

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-20  
**Status:** Ready for Implementation



