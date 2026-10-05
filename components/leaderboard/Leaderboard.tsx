'use client';

import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Award, TrendingUp, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Team } from '@/types/database';
import { Badge } from '@/components/ui/Badge';
import { ScoreChangeBadge } from '@/components/ui/ScoreChangeBadge';

interface LeaderboardProps {
  quizId: string;
  initialTeams?: Team[];
  isCompact?: boolean;
  highlightTeamId?: string;
  className?: string;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  quizId,
  initialTeams = [],
  isCompact = false,
  highlightTeamId,
  className = '',
}) => {
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [scoreChanges, setScoreChanges] = useState<{ [teamId: string]: number }>({});
  const supabase = createClient();

  // Sort teams descending by current_points
  const sortedTeams = [...teams].sort((a, b) => b.current_points - a.current_points);

  useEffect(() => {
    setTeams(initialTeams);
  }, [initialTeams]);

  // Realtime subscription on teams table for this quiz
  useEffect(() => {
    if (!quizId) return;

    // Fetch latest initial teams
    const fetchLatestTeams = async () => {
      const { data } = await supabase
        .from('teams')
        .select('*')
        .eq('quiz_id', quizId)
        .order('current_points', { ascending: false });

      if (data) {
        setTeams(data as Team[]);
      }
    };

    fetchLatestTeams();

    const channel = supabase
      .channel(`leaderboard-${quizId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `quiz_id=eq.${quizId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updatedTeam = payload.new as Team;
            setTeams((prev) => {
              const oldTeam = prev.find((t) => t.id === updatedTeam.id);
              if (oldTeam && oldTeam.current_points !== updatedTeam.current_points) {
                const diff = updatedTeam.current_points - oldTeam.current_points;
                setScoreChanges((curr) => ({ ...curr, [updatedTeam.id]: diff }));

                // Clear after animation duration
                setTimeout(() => {
                  setScoreChanges((curr) => {
                    const next = { ...curr };
                    delete next[updatedTeam.id];
                    return next;
                  });
                }, 2200);
              }
              return prev.map((t) => (t.id === updatedTeam.id ? updatedTeam : t));
            });
          } else if (payload.eventType === 'INSERT') {
            setTeams((prev) => [...prev, payload.new as Team]);
          } else if (payload.eventType === 'DELETE') {
            setTeams((prev) => prev.filter((t) => t.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId, supabase]);

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/40">
            <Trophy className="w-4 h-4" />
          </div>
        );
      case 2:
        return (
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-400 to-slate-200 text-slate-900 flex items-center justify-center font-black shadow-md shadow-slate-400/30">
            <Medal className="w-4 h-4" />
          </div>
        );
      case 3:
        return (
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-700 to-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-700/30">
            <Award className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center font-bold text-sm">
            #{rank}
          </div>
        );
    }
  };

  if (teams.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 glass-panel rounded-2xl">
        <Users className="w-8 h-8 mx-auto mb-2 text-slate-500 opacity-50" />
        <p className="text-sm">Belum ada tim yang terdaftar.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h4 className="font-bold text-white text-base uppercase tracking-wider">
            Leaderboard Realtime
          </h4>
        </div>
        <Badge variant="emerald" size="sm" icon={<TrendingUp className="w-3 h-3" />}>
          Live Sync
        </Badge>
      </div>

      {/* Team Rankings */}
      <div className="space-y-2">
        {sortedTeams.map((team, index) => {
          const rank = index + 1;
          const isHighlighted = highlightTeamId === team.id;
          const delta = scoreChanges[team.id];

          return (
            <div
              key={team.id}
              className={`relative flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300 ${
                isHighlighted
                  ? 'bg-blue-600/20 border-blue-500/60 shadow-lg shadow-blue-500/20'
                  : rank === 1
                  ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50'
                  : rank === 2
                  ? 'bg-slate-300/5 border-slate-300/20 hover:border-slate-300/40'
                  : rank === 3
                  ? 'bg-amber-700/10 border-amber-700/20 hover:border-amber-700/40'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Left: Rank & Team Info */}
              <div className="flex items-center gap-3">
                {getRankBadge(rank)}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base">{team.name}</span>
                    {isHighlighted && (
                      <span className="px-1.5 py-0.5 text-[10px] uppercase font-extrabold bg-blue-500 text-white rounded">
                        Giliran
                      </span>
                    )}
                  </div>
                  {team.description && !isCompact && (
                    <p className="text-xs text-slate-400 line-clamp-1">{team.description}</p>
                  )}
                </div>
              </div>

              {/* Right: Score & Animated Delta */}
              <div className="relative flex items-center gap-2">
                {delta !== undefined && (
                  <div className="absolute -top-3 right-0">
                    <ScoreChangeBadge change={delta} />
                  </div>
                )}
                <div className="text-right">
                  <span
                    className={`font-black font-mono tracking-tight ${
                      isCompact ? 'text-lg' : 'text-2xl'
                    } ${
                      rank === 1
                        ? 'text-amber-400'
                        : rank === 2
                        ? 'text-slate-200'
                        : rank === 3
                        ? 'text-amber-500'
                        : 'text-slate-300'
                    }`}
                  >
                    {team.current_points.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1 font-semibold uppercase">
                    PTS
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
