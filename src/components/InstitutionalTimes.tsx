
import React, { useState, useEffect } from 'react';
import { Clock, Globe, Zap, AlertCircle } from 'lucide-react';
import { getSessionStatus, SESSIONS } from '../lib/market-times';
import { cn } from '../lib/utils';

export const InstitutionalTimes: React.FC = () => {
  const [status, setStatus] = useState(getSessionStatus());

  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(getSessionStatus());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-[#F27D26]" />
          <h3 className="text-sm font-semibold text-white">التوقيت المؤسسي (Killzones)</h3>
        </div>
        <div className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-[#71717A]">
          {status.utcTime}
        </div>
      </div>

      <div className="space-y-4">
        {/* Current Status Banner */}
        {status.current ? (
          <div className={cn(
            "p-4 rounded-xl border flex items-center justify-between",
            status.current.isKillzone 
              ? "bg-[#F27D26]/10 border-[#F27D26]/20" 
              : "bg-blue-500/10 border-blue-500/20"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                status.current.isKillzone ? "bg-[#F27D26]/20" : "bg-blue-500/20"
              )}>
                {status.current.isKillzone ? (
                  <Zap className="w-4 h-4 text-[#F27D26]" />
                ) : (
                  <Globe className="w-4 h-4 text-blue-500" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">{status.current.name}</p>
                <p className="text-[10px] text-[#71717A]">
                  {status.current.isKillzone ? 'سيولة عالية (High Volatility)' : 'سيولة منخفضة (Low Volatility)'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                status.current.isKillzone ? "bg-[#F27D26] text-black" : "bg-blue-500 text-white"
              )}>
                نشط (Active)
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <AlertCircle className="w-4 h-4 text-[#71717A]" />
              </div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">خارج الجلسات</p>
                <p className="text-[10px] text-[#71717A]">انتظار افتتاح السيولة القادمة</p>
              </div>
            </div>
          </div>
        )}

        {/* Timeline Visualization */}
        <div className="relative pt-2 pb-6">
          <div className="h-1.5 w-full bg-white/5 rounded-full flex overflow-hidden">
            {SESSIONS.map((session, i) => {
              const startPos = (session.start / 24) * 100;
              const width = ((session.end - session.start) / 24) * 100;
              return (
                <div 
                  key={i}
                  className="h-full absolute opacity-40 hover:opacity-100 transition-opacity"
                  style={{ 
                    left: `${startPos}%`, 
                    width: `${width}%`,
                    backgroundColor: session.color
                  }}
                  title={session.name}
                />
              );
            })}
          </div>
          {/* Current Time Marker */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10 shadow-[0_0_10px_white]"
            style={{ left: `${(new Date().getUTCHours() / 24) * 100}%` }}
          />
          <div className="flex justify-between mt-2 text-[8px] font-mono text-[#71717A]">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:59</span>
          </div>
        </div>

        {/* Next Session Info */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#71717A]">الجلسة القادمة: <b className="text-white">{status.nextSession?.name}</b></span>
          <span className="text-[#F27D26] font-bold">يبدأ خلال {status.timeToNext}</span>
        </div>
      </div>
    </div>
  );
};
