export interface ImageStructure {
    images?: { local_path: string }[];
    local_path?: string;
}

export interface Post {
    id: string;
    content_text: string;
    status: 'pending_manual_review' | 'pending_approval' | 'approved' | 'rejected';
    created_at: string;
    quality_score: number;
    images?: ImageStructure | any;
    metadata?: {
        tier?: 'premium' | 'auto';
        [key: string]: any;
    };
}

export interface Account {
    id: string;
    handle: string;
    type: 'system' | 'source' | 'target';
    status: 'active' | 'paused';
    last_active: string;
    stat_metric: string;
    posts_to_generate?: number;
    enabled?: boolean;
}

export interface DashboardData {
    intelligence: any[];
    research: any[];
    queue: Post[];
    accounts: Account[];
    responseTriggers?: string[];
    huntingVips?: string[];
}

export type ViewState = 'dashboard' | 'premium' | 'auto' | 'system' | 'add-accounts';

