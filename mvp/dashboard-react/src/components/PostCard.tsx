import React, { useState } from 'react';
import { Post } from '../types';
import { getPostImage, copyToClipboard } from '../utils';

interface PostCardProps {
    post: Post;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, isSelected, onToggleSelect }) => {
    const [isCopied, setIsCopied] = useState(false);
    const imageUrl = getPostImage(post);
    const scorePercent = Math.round(post.quality_score * 100);
    
    // Determine score color class
    const scoreColor = scorePercent > 90 ? 'text-emerald-400' : scorePercent > 70 ? 'text-indigo-400' : 'text-amber-400';

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const success = await copyToClipboard(post.content_text, imageUrl);
        if (success) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    return (
        <div 
            onClick={() => onToggleSelect(post.id)}
            className={`
                group relative flex flex-col md:flex-row gap-6 p-6 
                border transition-all duration-300 ease-out cursor-pointer
                ${isSelected 
                    ? 'border-white bg-zinc-900/40' 
                    : 'border-zinc-800 bg-transparent hover:border-zinc-700 hover:bg-zinc-900/20'}
            `}
        >
            {/* Selection Indicator (Minimalist) */}
            <div className={`
                absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300
                ${isSelected ? 'bg-white' : 'bg-transparent group-hover:bg-zinc-800'}
            `} />

            {/* Image Section */}
            {imageUrl && (
                <div className="w-full md:w-48 h-48 flex-shrink-0 overflow-hidden bg-zinc-900 border border-zinc-800">
                    <img 
                        src={imageUrl} 
                        alt="Generated" 
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                        loading="lazy"
                    />
                </div>
            )}

            {/* Content Section */}
            <div className="flex-1 flex flex-col justify-between min-h-[12rem]">
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="font-mono text-xs text-zinc-500 tracking-wider uppercase">
                            ID: <span className="text-zinc-400">{post.id.split('-')[1]}</span>
                        </span>
                        <span className={`font-mono text-xs font-bold tracking-tighter ${scoreColor}`}>
                            QS: {scorePercent}
                        </span>
                    </div>
                    <p className="text-zinc-300 font-sans text-sm leading-relaxed whitespace-pre-wrap max-w-3xl">
                        {post.content_text}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-6 pt-6 border-t border-zinc-800/50">
                    <div className="flex items-center gap-3">
                         <span className="inline-flex items-center px-2 py-1 rounded border border-zinc-800 bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
                            {post.status.replace(/_/g, ' ')}
                         </span>
                    </div>
                    
                    <button 
                        onClick={handleCopy}
                        className={`
                            px-4 py-2 text-xs font-mono uppercase tracking-wider transition-all duration-300 border
                            ${isCopied 
                                ? 'bg-white text-black border-white' 
                                : 'bg-transparent text-white border-zinc-700 hover:border-white hover:text-white'}
                        `}
                    >
                        {isCopied ? 'Copied' : 'Copy Content'}
                    </button>
                </div>
            </div>
        </div>
    );
};





