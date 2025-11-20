/**
 * Normalizes the image path from the backend to be served by the frontend.
 */
export const normalizeImagePath = (originalPath: string): string => {
    if (!originalPath) return '';

    let normalized = originalPath;
    
    // Remove leading './' or './mvp/'
    normalized = normalized.replace(/^\.\/(mvp\/)?/, '');
    // Remove leading 'mvp/'
    normalized = normalized.replace(/^mvp\//, '');
    // Normalize Windows backslashes
    normalized = normalized.replace(/\\/g, '/');

    if (!normalized.startsWith('/assets')) {
        if (normalized.startsWith('assets/')) {
            normalized = '/' + normalized;
        } else {
            // Extract filename
            const match = normalized.match(/(generated\/[^\/]+\.(png|jpg|jpeg))$/i);
            if (match) {
                normalized = '/assets/' + match[1];
            } else {
                const generatedMatch = normalized.match(/(.*generated\/[^\/]+\.(png|jpg|jpeg))$/i);
                if (generatedMatch) {
                    normalized = '/assets/generated/' + generatedMatch[1].split(/[\/\\]/).pop();
                } else {
                     // Fallback to a generic structure if regex fails but we have a filename
                     const parts = normalized.split('/');
                     normalized = '/assets/generated/' + parts[parts.length - 1];
                }
            }
        }
    }
    
    // Use the API base URL for images
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    return `${API_BASE}${normalized}`;
};

/**
 * Extract the valid image path from the messy Post object structure
 */
export const getPostImage = (post: any): string | null => {
    let imgPath = null;

    // Structure 1: post.images.images[0].local_path
    if (post.images?.images && Array.isArray(post.images.images) && post.images.images.length > 0) {
        imgPath = post.images.images[0].local_path;
    }
    // Structure 2: post.images[0].local_path
    else if (Array.isArray(post.images) && post.images.length > 0 && post.images[0].local_path) {
        imgPath = post.images[0].local_path;
    }
    // Structure 3: post.images.local_path
    else if (post.images?.local_path) {
        imgPath = post.images.local_path;
    }
    // Structure 4: direct string array (Auto posts sometimes)
    else if (Array.isArray(post.images) && typeof post.images[0] === 'string') {
        imgPath = post.images[0];
    }

    return imgPath ? normalizeImagePath(imgPath) : null;
};

export const copyToClipboard = async (text: string, imageUrl: string | null): Promise<boolean> => {
    try {
        // 1. Write text
        await navigator.clipboard.writeText(text);

        // 2. Try to write image if exists
        if (imageUrl) {
            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                
                const item = new ClipboardItem({ 
                    [blob.type]: blob 
                });
                await navigator.clipboard.write([item]);
                return true; // Image copied (overwrites text usually in clipboard manager, but allows pasting image)
            } catch (e) {
                console.warn("Image copy failed, text only", e);
                return true; // Text at least succeeded
            }
        }
        return true;
    } catch (err) {
        console.error("Clipboard failed", err);
        return false;
    }
};

