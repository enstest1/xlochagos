import { DashboardData, Post } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const fetchDashboardData = async (): Promise<DashboardData> => {
    const response = await fetch(`${API_BASE}/api/dashboard`);
    if (!response.ok) throw new Error('Network response was not ok');
    return response.json();
};

export const updatePostStatus = async (postId: string, status: 'approved' | 'rejected'): Promise<void> => {
    await fetch(`${API_BASE}/api/update-post-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, status })
    });
    if (!response.ok) throw new Error('Failed to update post status');
};





