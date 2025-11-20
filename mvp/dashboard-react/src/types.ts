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

export interface DashboardData {
    intelligence: any[];
    research: any[];
    queue: Post[];
}

export type ViewState = 'dashboard' | 'premium' | 'auto' | 'system';

