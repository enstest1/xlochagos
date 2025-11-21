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
        if (imageUrl) {
            console.log('Copying both text and image...', { text: text.substring(0, 50), imageUrl });
            
            // Fetch the image
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status}`);
            }
            const imageBlob = await response.blob();
            console.log('Image blob created:', imageBlob.type, imageBlob.size);
            
            // Create a single ClipboardItem with BOTH text/plain AND image format
            // This is the key - both formats in ONE item (like content-approval.html)
            const textBlob = new Blob([text], { type: 'text/plain' });
            const imageType = imageBlob.type || 'image/png';
            
            // Put both formats in a single ClipboardItem
            const clipboardItem = new ClipboardItem({
                'text/plain': textBlob,
                [imageType]: imageBlob
            });
            
            await navigator.clipboard.write([clipboardItem]);
            console.log('Both text and image copied to clipboard in single item');
            
            return true;
        } else {
            // No image, just copy text
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (err) {
        console.error("Clipboard failed", err);
        
        // Fallback: Try copying text first, then image separately
        try {
            await navigator.clipboard.writeText(text);
            console.log('Text copied as fallback');
            
            if (imageUrl) {
                // Try to copy image after a brief delay
                setTimeout(async () => {
                    try {
                        const response = await fetch(imageUrl);
                        const blob = await response.blob();
                        const item = new ClipboardItem({ [blob.type]: blob });
                        await navigator.clipboard.write([item]);
                        console.log('Image copied as fallback');
                    } catch (imgErr) {
                        console.error("Image copy failed in fallback", imgErr);
                    }
                }, 50);
            }
            
            return true;
        } catch (fallbackErr) {
            console.error("Text copy also failed", fallbackErr);
            return false;
        }
    }
};

