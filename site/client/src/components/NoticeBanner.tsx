import React, { useState } from 'react';
import { Bookmark, Share2, X } from 'lucide-react';

export const NoticeBanner: React.FC = () => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="rounded-lg bg-[#142030] border border-[#1a2a3e] p-3 text-xs text-slate-300 space-y-2 relative">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bookmark className="w-3.5 h-3.5 text-[#209cee] flex-shrink-0" />
          <span>
            Please bookmark <strong className="text-[#209cee]">anistash.play</strong> to stay updated about your local library. Thank you!
          </span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-slate-400 hover:text-white p-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 pt-1 border-t border-[#1a2a3e]/60 text-slate-400 text-[11px]">
        <span>If you enjoy AniStash Play, consider sharing it with your friends. Thank you!</span>
        <button className="p-1 rounded bg-[#70a800] hover:bg-[#80b918] text-white gpu-trans">
          <Share2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
