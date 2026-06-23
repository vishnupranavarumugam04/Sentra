import React, { useEffect } from 'react';
import { Medal } from 'lucide-react';

export default function ScoreToast({ gamification, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!gamification) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-bounce-short">
      <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-1 rounded-2xl shadow-xl shadow-amber-500/20 max-w-[90vw] w-72">
        <div className="bg-slate-950 p-4 rounded-xl relative overflow-hidden">
          {/* Shimmer effect */}
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent shimmer-animation" />
          
          <div className="flex items-center space-x-4 relative z-10">
            <div className="bg-amber-500/20 p-2.5 rounded-full border border-amber-500/40">
              <Medal className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-amber-400 font-bold uppercase tracking-wider mb-0.5">
                +{gamification.pointsEarned} Points Earned!
              </p>
              <p className="text-sm text-white font-black">
                {gamification.newRank}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Total Score: <strong className="text-amber-500">{gamification.newScore}</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
