import React, { useState, useEffect } from 'react';
import { Crown, Medal, User, Award } from 'lucide-react';

export default function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('/api/leaderboard');
        if (response.ok) {
          const data = await response.json();
          setLeaders(data.leaderboard);
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="p-4 bg-slate-900/50 rounded-2xl animate-pulse space-y-3">
        <div className="h-4 bg-slate-800 rounded w-1/3"></div>
        <div className="h-10 bg-slate-800 rounded"></div>
        <div className="h-10 bg-slate-800 rounded"></div>
      </div>
    );
  }

  if (leaders.length === 0) return null;

  return (
    <div className="bg-slate-900/80 backdrop-blur-md rounded-3xl p-5 border border-slate-800 shadow-2xl">
      <div className="flex items-center space-x-2 mb-4">
        <Award className="h-5 w-5 text-amber-500" />
        <h3 className="text-sm font-black text-white uppercase tracking-wider">Community Leaderboard</h3>
      </div>
      
      <div className="space-y-2">
        {leaders.map((leader, index) => {
          let Icon = User;
          let iconColor = "text-slate-500";
          let bgClass = "bg-slate-950/50 border-slate-800";
          
          if (index === 0) {
            Icon = Crown;
            iconColor = "text-yellow-400";
            bgClass = "bg-yellow-500/10 border-yellow-500/30";
          } else if (index === 1) {
            Icon = Medal;
            iconColor = "text-slate-300";
            bgClass = "bg-slate-400/10 border-slate-400/30";
          } else if (index === 2) {
            Icon = Medal;
            iconColor = "text-amber-600";
            bgClass = "bg-amber-700/10 border-amber-700/30";
          }

          return (
            <div key={index} className={`flex items-center justify-between p-3 rounded-xl border ${bgClass}`}>
              <div className="flex items-center space-x-3">
                <div className={`font-black text-lg ${iconColor} w-6 text-center`}>
                  #{index + 1}
                </div>
                <div className={`p-1.5 rounded-full bg-slate-900 border ${bgClass}`}>
                  <Icon className={`h-4 w-4 ${iconColor}`} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">{leader.display_name}</p>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    {leader.rank_label} • {leader.total_reports} Reports
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="block text-sm font-black text-amber-400">{leader.score}</span>
                <span className="block text-[8px] text-amber-500/60 uppercase font-bold tracking-wider">PTS</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
