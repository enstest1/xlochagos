import { DashboardData, Post, Account } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const fetchDashboardData = async (): Promise<DashboardData> => {
    const response = await fetch(`${API_BASE}/api/dashboard`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    
    console.log('[API] Raw response from /api/dashboard:', data);
    console.log('[API] Accounts in response:', data.accounts);
    console.log('[API] Accounts length:', data.accounts?.length);
    console.log('[API] Response triggers in response:', data.responseTriggers);
    console.log('[API] Response triggers length:', data.responseTriggers?.length);
    console.log('[API] All response keys:', Object.keys(data));
    
    // Transform the API response to match DashboardData interface
    const transformed = {
        intelligence: data.intelligence || [],
        research: data.research || [],
        queue: data.queue || [],
        accounts: data.accounts || [],
        responseTriggers: data.responseTriggers || [],
        huntingVips: data.huntingVips || []
    };
    
    console.log('[API] Transformed data:', transformed);
    console.log('[API] Transformed accounts:', transformed.accounts);
    console.log('[API] Transformed accounts length:', transformed.accounts.length);
    
    return transformed;
};

export const updatePostStatus = async (postId: string, status: 'approved' | 'rejected'): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/update-post-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, status })
    });
    if (!response.ok) throw new Error('Failed to update post status');
};

export const fetchAccounts = async (): Promise<Account[]> => {
    const response = await fetch(`${API_BASE}/api/accounts`);
    if (!response.ok) throw new Error('Failed to fetch accounts');
    return response.json();
};

export const addAccount = async (handle: string, type: 'source' | 'target'): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, type })
    });
    if (!response.ok) throw new Error('Failed to add account');
};

