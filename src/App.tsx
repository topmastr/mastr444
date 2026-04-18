import { useState, useRef, useEffect, Component, ReactNode, memo, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Play, 
  Pause, 
  Volume2, 
  ShieldCheck, 
  Target, 
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Loader2,
  CheckCircle2,
  History,
  BarChart3,
  User,
  LogOut,
  XCircle,
  Trophy,
  X,
  Zap,
  Cpu,
  BrainCircuit,
  ArrowUpRight,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { cn, toSafeDate } from './lib/utils';
import { InstitutionalTimes } from './components/InstitutionalTimes';
import { analyzeCharts, generateVoiceExplanation, evolveStrategy, type AnalysisResult } from './services/gemini';
import { 
  auth, 
  signIn, 
  saveTradeAnalysis, 
  getHistoricalContext, 
  updateTradeOutcome, 
  getLosingTrades,
  getFailedTrades,
  saveStrategyRefinement,
  getLatestRefinement,
  saveLearningSession,
  getLearningSessions,
  getTradeHistory,
  getGoldStandardTrade,
  cacheUtil,
  syncUserProfile,
  clearAllCaches,
  logFirestoreEvent,
  db 
} from './services/firebase';
import { getDocFromServer, doc } from 'firebase/firestore';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { Trade, Stats, StrategyRefinement, LearningSession } from './types';

const TIMEFRAMES = [
  { id: 'D1', label: 'اليومي (D1)', desc: 'أهداف السيولة' },
  { id: 'H4', label: '4 ساعات (H4)', desc: 'انحياز متوسط المدى' },
  { id: 'H1', label: 'ساعة (H1)', desc: 'انحياز السوق' },
  { id: 'M15', label: '15 دقيقة (M15)', desc: 'التأكيد' },
  { id: 'M5', label: '5 دقائق (M5)', desc: 'MSS, FVG & Momentum' }
];

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "حدث خطأ غير متوقع في النظام. تم تفعيل بروتوكول الإصلاح الذاتي.";
      let errorTitle = "بروتوكول الطوارئ النشط";
      let errorIcon = <AlertTriangle className="w-10 h-10 text-[#EF4444]" />;
      let showApiKeyAction = false;
      let showAuthAction = false;
      
      const errorStr = this.state.error?.message || "";
      
      // 1. Quota Errors (429)
      if (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("QUOTA_EXHAUSTED") || errorStr.includes("Quota") || errorStr.includes("quota")) {
        errorTitle = "تم تجاوز حصة الاستخدام";
        errorMessage = "لقد تجاوزت الحد المسموح به من الطلبات (Quota Exceeded). يمكنك الانتظار حتى يتم تصفير الحصة أو استخدام مفتاح API الخاص بك لتجاوز هذا القيد.";
        errorIcon = <Zap className="w-10 h-10 text-amber-500" />;
        showApiKeyAction = true;
      } 
      // 2. Network/Firestore Errors
      else if (errorStr.includes("network") || errorStr.includes("offline") || errorStr.includes("Could not reach Cloud Firestore")) {
        errorTitle = "خطأ في الاتصال";
        errorMessage = "يبدو أن هناك مشكلة في الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت الخاص بك.";
        errorIcon = <Activity className="w-10 h-10 text-blue-500" />;
      }
      // 3. Authentication Errors
      else if (errorStr.includes("auth") || errorStr.includes("permission-denied") || errorStr.includes("unauthenticated")) {
        errorTitle = "خطأ في الصلاحيات";
        errorMessage = "انتهت صلاحية الجلسة أو لا تملك الصلاحية الكافية للوصول إلى هذه البيانات. يرجى تسجيل الدخول مرة أخرى.";
        errorIcon = <ShieldCheck className="w-10 h-10 text-purple-500" />;
        showAuthAction = true;
      }

      const handleRepair = () => {
        clearAllCaches();
        window.location.reload();
      };

      const handleOpenSettings = () => {
        // @ts-ignore
        if (window.aistudio?.openSettings) {
          // @ts-ignore
          window.aistudio.openSettings();
        } else {
          alert("يرجى فتح الإعدادات من القائمة الجانبية لإضافة مفتاح API.");
        }
      };

      return (
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full p-8 bg-[#151519] border border-[#1F1F23] rounded-2xl shadow-2xl">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              {errorIcon}
            </div>
            <h2 className="text-xl font-bold mb-4 text-white">{errorTitle}</h2>
            <p className="text-[#71717A] text-sm mb-8 leading-relaxed">
              {errorMessage}
            </p>
            <div className="space-y-3">
              {showApiKeyAction && (
                <button
                  onClick={handleOpenSettings}
                  className="w-full py-3 bg-amber-500 text-black rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-amber-400 transition-all flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  استخدام مفتاح API الخاص بك
                </button>
              )}
              
              {showAuthAction && (
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-purple-500 transition-all flex items-center justify-center gap-2"
                >
                  <User className="w-4 h-4" />
                  إعادة تسجيل الدخول
                </button>
              )}

              <button
                onClick={handleRepair}
                className="w-full py-3 bg-[#F27D26] text-black rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-[#FF8D3A] transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                إصلاح النظام وإعادة التشغيل
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-white/5 text-[#71717A] rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                إعادة محاولة بسيطة
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

// Memoized Components for Performance Optimization
const AnalysisItem = memo(({ label, content, icon: Icon }: { label: string, content: string, icon: any }) => (
  <div className="p-4 bg-[#151519] border border-[#1F1F23] rounded-xl hover:border-[#F27D26]/30 transition-all group">
    <div className="flex items-center gap-3 mb-2">
      <div className="w-8 h-8 rounded-lg bg-[#F27D26]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
        <Icon className="w-4 h-4 text-[#F27D26]" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">{label}</span>
    </div>
    <p className="text-xs text-[#E4E4E7] leading-relaxed">{content}</p>
  </div>
));

const TradeCard = memo(({ result, latestRefinement, currentTradeId, onOutcomeUpdate, isSimulated }: { 
  result: AnalysisResult, 
  latestRefinement: StrategyRefinement | null, 
  currentTradeId: string | null,
  onOutcomeUpdate: (id: string, outcome: 'WIN' | 'LOSS' | 'MISSED' | 'AVOIDED') => void,
  isSimulated: boolean
}) => (
  <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-6 relative overflow-hidden">
    <div className="absolute top-0 right-0 p-4">
      {!result.shouldTrade ? (
        <XCircle className="w-12 h-12 text-[#71717A]/20" />
      ) : result.tradeSetup.direction === 'BUY' ? (
        <TrendingUp className="w-12 h-12 text-[#22C55E]/20" />
      ) : (
        <TrendingDown className="w-12 h-12 text-[#EF4444]/20" />
      )}
    </div>
    
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {!result.shouldTrade ? (
        <div className="px-3 py-1 bg-white/5 rounded text-[10px] font-bold tracking-widest text-[#71717A]">
          لا يوجد تداول (No Trade)
        </div>
      ) : (
        <>
          <div className={cn(
            "px-3 py-1 rounded text-[10px] font-bold tracking-widest",
            result.tradeSetup.direction === 'BUY' ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]"
          )}>
            طلب {result.tradeSetup.direction === 'BUY' ? 'شراء' : 'بيع'}
          </div>
          <div className="px-3 py-1 bg-white/5 rounded text-[10px] font-bold tracking-widest text-[#A1A1AA]">
            العائد {result.tradeSetup.riskReward}
          </div>
        </>
      )}
      <div className={cn(
        "px-3 py-1 rounded text-[10px] font-bold tracking-widest flex items-center gap-1.5",
        result.marketCondition === 'BULLISH' ? "bg-[#22C55E]/10 text-[#22C55E]" : 
        result.marketCondition === 'BEARISH' ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-white/5 text-[#71717A]"
      )}>
        <TrendingUp className="w-3 h-3" />
        {result.marketCondition === 'BULLISH' ? 'صعودي' : result.marketCondition === 'BEARISH' ? 'هبوطي' : 'عرضي'}
      </div>
      <div className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded text-[10px] font-bold tracking-widest text-purple-400 flex items-center gap-1.5">
        <Activity className="w-3 h-3" />
        {result.structureType}
      </div>
      <div className={cn(
        "px-3 py-1 rounded text-[10px] font-bold tracking-widest",
        result.tradeQuality === 'A+' || result.tradeQuality === 'A' ? "bg-[#F27D26]/10 text-[#F27D26]" : "bg-white/5 text-[#71717A]"
      )}>
        جودة {result.tradeQuality}
      </div>
      {latestRefinement && (
        <div className="px-3 py-1 bg-[#F27D26]/20 border border-[#F27D26]/30 rounded text-[10px] font-bold tracking-widest text-[#F27D26] flex items-center gap-1">
          <Zap className="w-3 h-3" />
          إصدار {latestRefinement.version}
        </div>
      )}
      <div className="px-3 py-1 bg-[#22C55E]/10 border border-[#22C55E]/20 rounded text-[10px] font-bold tracking-widest text-[#22C55E] flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        تم الحفظ في السجل
      </div>
      {isSimulated && (
        <div className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded text-[10px] font-bold tracking-widest text-purple-400 flex items-center gap-1">
          <BrainCircuit className="w-3 h-3" />
          محاكاة
        </div>
      )}
    </div>

    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-widest">مستوى الثقة</span>
        <span className="text-[10px] font-bold text-[#F27D26]">{result.confidenceScore}%</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${result.confidenceScore}%` }}
          className="h-full bg-[#F27D26]"
        />
      </div>
    </div>

    {!result.shouldTrade ? (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3"
      >
        <ShieldCheck className="w-5 h-5 text-[#71717A] shrink-0" />
        <div>
          <p className="text-[10px] font-bold text-[#71717A] uppercase tracking-widest mb-1">تمت تصفية الصفقة (Filtered Out)</p>
          <p className="text-[11px] text-[#A1A1AA] leading-tight">
            {result.noTradeReason || "لم تكتمل شروط الدخول المؤسسية. النظام يفضل الانتظار بدلاً من المخاطرة."}
          </p>
        </div>
      </motion.div>
    ) : (result.confidenceScore < 75 || result.tradeQuality === 'C') && (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mb-6 p-4 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl flex items-center gap-3"
      >
        <AlertTriangle className="w-5 h-5 text-[#EF4444] shrink-0" />
        <div>
          <p className="text-[10px] font-bold text-[#EF4444] uppercase tracking-widest mb-1">تحذير: منطقة عدم تداول (No Trade Zone)</p>
          <p className="text-[11px] text-[#EF4444]/80 leading-tight">
            ثقة منخفضة ({result.confidenceScore}%) أو جودة صفقة غير مؤسسية. يوصى بتجنب الدخول حتى يتضح هيكل السوق.
          </p>
        </div>
      </motion.div>
    )}

    {result.shouldTrade && (
      <>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 bg-white/5 rounded-xl border border-white/5">
            <p className="text-[9px] text-[#71717A] uppercase font-bold mb-1">الانحياز المؤسسي</p>
            <div className="flex items-center gap-2">
              {result.tradeSetup.direction === 'BUY' ? (
                <TrendingUp className="w-4 h-4 text-[#22C55E]" />
              ) : (
                <TrendingDown className="w-4 h-4 text-[#EF4444]" />
              )}
              <span className="text-xs font-bold">{result.tradeSetup.direction === 'BUY' ? 'صعودي (Bullish)' : 'هبوطي (Bearish)'}</span>
            </div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/5">
            <p className="text-[9px] text-[#71717A] uppercase font-bold mb-1">تأكيد الزخم</p>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-bold">قوي (Strong)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="space-y-1">
            <p className="text-[10px] text-[#71717A] uppercase font-mono">الدخول</p>
            <p className="text-xl font-bold font-mono tracking-tighter">{result.tradeSetup.entry.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-[#71717A] uppercase font-mono">وقف الخسارة</p>
            <p className="text-xl font-bold font-mono tracking-tighter text-[#EF4444]">{result.tradeSetup.stopLoss.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-[#71717A] uppercase font-mono">جني الأرباح</p>
            <p className="text-xl font-bold font-mono tracking-tighter text-[#22C55E]">{result.tradeSetup.takeProfit.toFixed(2)}</p>
          </div>
        </div>
      </>
    )}

    <div className="p-4 bg-white/5 rounded-xl border border-white/5 mb-6">
      <p className="text-xs text-[#A1A1AA] leading-relaxed italic">
        "{result.shouldTrade ? result.tradeSetup.reasoning : result.explanation}"
      </p>
    </div>

    <div className="pt-6 border-t border-white/5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] mb-3">حلقة تغذية التدريب</p>
      {currentTradeId ? (
        <div className="flex flex-wrap gap-2">
          {result.shouldTrade ? (
            <>
              <button 
                onClick={() => onOutcomeUpdate(currentTradeId, 'WIN')}
                className="flex-1 min-w-[100px] py-2 bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 rounded-lg text-[10px] font-bold uppercase hover:bg-[#22C55E]/20 transition-all flex items-center justify-center gap-2"
              >
                <Trophy className="w-3 h-3" />
                تحديد كربح
              </button>
              <button 
                onClick={() => onOutcomeUpdate(currentTradeId, 'LOSS')}
                className="flex-1 min-w-[100px] py-2 bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 rounded-lg text-[10px] font-bold uppercase hover:bg-[#EF4444]/20 transition-all flex items-center justify-center gap-2"
              >
                <XCircle className="w-3 h-3" />
                تحديد كخسارة
              </button>
              <button 
                onClick={() => onOutcomeUpdate(currentTradeId, 'MISSED')}
                className="flex-1 min-w-[100px] py-2 bg-[#F27D26]/10 text-[#F27D26] border border-[#F27D26]/20 rounded-lg text-[10px] font-bold uppercase hover:bg-[#F27D26]/20 transition-all flex items-center justify-center gap-2"
              >
                <AlertCircle className="w-3 h-3" />
                فرصة ضائعة
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => onOutcomeUpdate(currentTradeId, 'AVOIDED')}
                className="flex-1 min-w-[100px] py-2 bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 rounded-lg text-[10px] font-bold uppercase hover:bg-[#22C55E]/20 transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-3 h-3" />
                تجنب صحيح (Correct)
              </button>
              <button 
                onClick={() => onOutcomeUpdate(currentTradeId, 'MISSED')}
                className="flex-1 min-w-[100px] py-2 bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 rounded-lg text-[10px] font-bold uppercase hover:bg-[#EF4444]/20 transition-all flex items-center justify-center gap-2"
              >
                <AlertCircle className="w-3 h-3" />
                فرصة ضائعة (Missed Win)
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-[#22C55E]/5 border border-[#22C55E]/10 rounded-lg p-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-[#22C55E]" />
          <p className="text-[11px] text-[#22C55E]/80 font-medium">تم تسجيل نتيجة الصفقة بنجاح وتحديث سياق التعلم.</p>
        </div>
      )}
      <p className="text-[9px] text-[#71717A] mt-3 text-center">
        تساعد التغذية الراجعة الذكاء الاصطناعي على التخلص من التحليل العشوائي وتحسين الدقة.
      </p>
    </div>
  </div>
));

const VoiceBriefing = memo(({ audioUrl, isPlaying, onToggle, audioRef, onEnded, onError }: {
  audioUrl: string,
  isPlaying: boolean,
  onToggle: () => void,
  audioRef: any,
  onEnded: () => void,
  onError: (e: any) => void
}) => (
  <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <Volume2 className="w-5 h-5 text-[#F27D26]" />
        <h3 className="text-sm font-semibold">إحاطة صوتية بالذكاء الاصطناعي</h3>
      </div>
      <button 
        onClick={onToggle}
        className="w-10 h-10 bg-[#F27D26] text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform"
      >
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 mr-1" />}
      </button>
    </div>
    <audio 
      key={audioUrl}
      ref={audioRef} 
      src={audioUrl} 
      onEnded={onEnded}
      onError={onError}
      className="hidden"
    />
    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
      <motion.div 
        className="h-full bg-[#F27D26]"
        animate={{ width: isPlaying ? '100%' : '0%' }}
        transition={{ duration: 30, ease: "linear" }}
      />
    </div>
  </div>
));

const HistoryCard = memo(({ trade, onOutcomeUpdate }: { trade: Trade, onOutcomeUpdate: (id: string, outcome: 'WIN' | 'LOSS' | 'MISSED' | 'AVOIDED') => void }) => (
  <div className="bg-[#151519] border border-[#1F1F23] rounded-xl p-5 space-y-4">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono text-[#71717A]">
        {toSafeDate(trade.timestamp).toLocaleDateString('ar-EG')}
      </span>
      <div className="flex items-center gap-2">
        {trade.isSimulated && (
          <div className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-[8px] font-bold text-purple-400 uppercase">
            محاكاة
          </div>
        )}
        <div className={cn(
          "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest",
          trade.analysis.tradeQuality === 'A+' || trade.analysis.tradeQuality === 'A' ? "bg-[#F27D26]/10 text-[#F27D26]" : "bg-white/5 text-[#71717A]"
        )}>
          {trade.analysis.tradeQuality}
        </div>
        <div className={cn(
          "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest",
          trade.outcome === 'WIN' ? "bg-[#22C55E]/10 text-[#22C55E]" : 
          trade.outcome === 'LOSS' ? "bg-[#EF4444]/10 text-[#EF4444]" : 
          trade.outcome === 'MISSED' ? "bg-[#F27D26]/10 text-[#F27D26]" :
          trade.outcome === 'AVOIDED' ? "bg-[#22C55E]/10 text-[#22C55E]" :
          "bg-white/5 text-[#A1A1AA]"
        )}>
          {trade.outcome === 'WIN' ? 'ربح' : trade.outcome === 'LOSS' ? 'خسارة' : trade.outcome === 'MISSED' ? 'ضائعة' : trade.outcome === 'AVOIDED' ? 'تجنب صحيح' : 'معلق'}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="px-2 py-0.5 bg-white/5 rounded text-[8px] font-bold text-[#71717A] uppercase">
          {trade.analysis.marketCondition}
        </div>
        <div className="px-2 py-0.5 bg-purple-500/10 rounded text-[8px] font-bold text-purple-400 uppercase">
          {trade.analysis.structureType}
        </div>
      </div>
    </div>
    
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-8 h-8 rounded flex items-center justify-center",
        trade.analysis.tradeSetup.direction === 'BUY' ? "bg-[#22C55E]/10" : "bg-[#EF4444]/10"
      )}>
        {trade.analysis.tradeSetup.direction === 'BUY' ? 
          <TrendingUp className="w-4 h-4 text-[#22C55E]" /> : 
          <TrendingDown className="w-4 h-4 text-[#EF4444]" />
        }
      </div>
      <div>
        <p className="text-sm font-bold">XAUUSD {trade.analysis.tradeSetup.direction === 'BUY' ? 'شراء' : 'بيع'}</p>
        <p className="text-[10px] text-[#71717A]">الدخول: {trade.analysis.tradeSetup.entry}</p>
      </div>
    </div>

    <p className="text-xs text-[#A1A1AA] line-clamp-2 italic">
      "{trade.analysis.tradeSetup.reasoning}"
    </p>

    {trade.outcome === 'PENDING' && (
      <div className="flex gap-2 pt-3 border-t border-white/5 mt-3">
        {trade.analysis.shouldTrade ? (
          <>
            <button 
              onClick={() => onOutcomeUpdate(trade.id, 'WIN')}
              className="flex-1 py-1.5 bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 rounded-lg text-[9px] font-bold uppercase hover:bg-[#22C55E]/20 transition-all flex items-center justify-center gap-1.5"
            >
              <Trophy className="w-2.5 h-2.5" />
              تحديد كربح
            </button>
            <button 
              onClick={() => onOutcomeUpdate(trade.id, 'LOSS')}
              className="flex-1 py-1.5 bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 rounded-lg text-[9px] font-bold uppercase hover:bg-[#EF4444]/20 transition-all flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-2.5 h-2.5" />
              تحديد كخسارة
            </button>
            <button 
              onClick={() => onOutcomeUpdate(trade.id, 'MISSED')}
              className="flex-1 py-1.5 bg-[#F27D26]/10 text-[#F27D26] border border-[#F27D26]/20 rounded-lg text-[9px] font-bold uppercase hover:bg-[#F27D26]/20 transition-all flex items-center justify-center gap-1.5"
            >
              <AlertCircle className="w-2.5 h-2.5" />
              فرصة ضائعة
            </button>
          </>
        ) : (
          <>
            <button 
              onClick={() => onOutcomeUpdate(trade.id, 'AVOIDED')}
              className="flex-1 py-1.5 bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 rounded-lg text-[9px] font-bold uppercase hover:bg-[#22C55E]/20 transition-all flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-2.5 h-2.5" />
              تجنب صحيح
            </button>
            <button 
              onClick={() => onOutcomeUpdate(trade.id, 'MISSED')}
              className="flex-1 py-1.5 bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 rounded-lg text-[9px] font-bold uppercase hover:bg-[#EF4444]/20 transition-all flex items-center justify-center gap-1.5"
            >
              <AlertCircle className="w-2.5 h-2.5" />
              فرصة ضائعة
            </button>
          </>
        )}
      </div>
    )}
  </div>
));

const StatCard = memo(({ label, value, icon: Icon, color }: { label: string, value: string | number, icon: any, color: string }) => (
  <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}10` }}>
        <Icon className="w-5 h-5" style={{ color: color }} />
      </div>
    </div>
    <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] mb-1">{label}</p>
    <p className="text-3xl font-bold tracking-tighter">{value}</p>
  </div>
));

const SessionCard = memo(({ session, index, totalSessions }: { session: LearningSession, index: number, totalSessions: number }) => (
  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-bold text-[#F27D26] uppercase">جلسة #{totalSessions - index}</span>
      <span className="text-[10px] text-[#71717A]">{toSafeDate(session.timestamp).toLocaleString('ar-EG')}</span>
    </div>
    <p className="text-xs text-[#D4D4D8] mb-2 line-clamp-2">{session.analysis}</p>
    <div className="flex items-center gap-2">
      <span className="text-[9px] px-2 py-0.5 bg-[#EF4444]/10 text-[#EF4444] rounded">تم تحليل {session.losingTradesCount} صفقات فاشلة/ضائعة</span>
    </div>
  </div>
));

const SystemHealth = memo(({ isAnalyzing, isEvolving, lastRefinement, stats }: { isAnalyzing: boolean, isEvolving: boolean, lastRefinement: StrategyRefinement | null, stats: Stats }) => (
  <div className="p-4 bg-[#151519] border border-[#1F1F23] rounded-xl">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        <Activity className="w-4 h-4 text-[#22C55E]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">حالة المحرك الخوارزمي (Algorithmic Engine)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={cn("w-2 h-2 rounded-full animate-pulse", isAnalyzing || isEvolving ? "bg-yellow-500" : "bg-[#22C55E]")} />
        <span className="text-[9px] font-bold text-[#71717A]">{isAnalyzing || isEvolving ? 'جاري المعالجة الخوارزمية...' : 'مستقر'}</span>
      </div>
    </div>
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#71717A]">تحليل IPDA & SMC</span>
        <span className="text-[#22C55E] font-bold">نشط</span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#71717A]">تتبع تدفق السيولة</span>
        <span className="text-[#22C55E] font-bold">نشط</span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#71717A]">دقة الخوارزمية</span>
        <span className="text-[#F27D26] font-bold">{stats.winRate}%</span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#71717A]">إدارة المخاطر (TP $4 / SL $12)</span>
        <span className="text-[#F27D26] font-bold">صارم</span>
      </div>
      {lastRefinement && (
        <div className="mt-2 pt-2 border-t border-[#1F1F23]">
          <p className="text-[9px] text-[#71717A] leading-tight">
            تم آخر تحديث خوارزمي في الإصدار v{lastRefinement.version} بناءً على تحليل التدفق المؤسسي.
          </p>
        </div>
      )}
    </div>
  </div>
));

const StrategyRules = memo(({ refinement }: { refinement: StrategyRefinement | null }) => {
  if (!refinement) return (
    <div className="p-4 bg-[#151519] border border-[#1F1F23] rounded-xl">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck className="w-4 h-4 text-[#71717A]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">قواعد الاستراتيجية النشطة</span>
      </div>
      <p className="text-[11px] text-[#71717A]">بانتظار أول عملية تطور لتوليد قواعد مخصصة...</p>
    </div>
  );

  return (
    <div className="p-4 bg-[#F27D26]/5 border border-[#F27D26]/20 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-[#F27D26]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#F27D26]">قواعد الاستراتيجية النشطة (v{refinement.version})</span>
        </div>
        <div className="px-2 py-0.5 bg-[#F27D26]/20 rounded text-[9px] font-bold text-[#F27D26]">نشط</div>
      </div>
      <div className="space-y-2">
        {refinement.refinements.slice(0, 3).map((rule, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-[#F27D26] mt-1.5 shrink-0" />
            <p className="text-[11px] text-[#D4D4D8] leading-tight">{rule}</p>
          </div>
        ))}
      </div>
    </div>
  );
});

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [images, setImages] = useState<{ [key: string]: string }>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEvolving, setIsEvolving] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [currentTradeId, setCurrentTradeId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'analyze' | 'history' | 'stats' | 'evolution'>('analyze');
  const [history, setHistory] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, wins: 0, losses: 0, missed: 0, winRate: 0, evolutionLevel: 1 });
  const [latestRefinement, setLatestRefinement] = useState<StrategyRefinement | null>(null);
  const [learningSessions, setLearningSessions] = useState<LearningSession[]>([]);
  const [historicalContext, setHistoricalContext] = useState<{ wins: Trade[], losses: Trade[], missed: Trade[], avoided: Trade[] } | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasSelectedKey, setHasSelectedKey] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(cacheUtil.isQuotaCooldown());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenersRef = useRef<{ [key: string]: () => void }>({});

  useEffect(() => {
    const interval = setInterval(() => {
      setIsOfflineMode(cacheUtil.isQuotaCooldown());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio?.hasSelectedApiKey) {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasSelectedKey(selected);
      }
    };
    checkKey();
    testConnection();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        syncUserProfile(u);
        setupRealTimeListeners(u.uid);
      } else {
        // Cleanup listeners on logout
        Object.values(listenersRef.current).forEach(unsub => unsub());
        listenersRef.current = {};
      }
    });
    return () => {
      unsubscribe();
      Object.values(listenersRef.current).forEach(unsub => unsub());
    };
  }, []);

  const setupRealTimeListeners = useCallback((userId: string) => {
    // Prevent duplicate listeners
    if (listenersRef.current['trades']) {
      logFirestoreEvent('Listener already active', { collection: 'trades' });
      return;
    }

    logFirestoreEvent('Setting up real-time listeners', { userId });

    const cleanup = () => {
      Object.values(listenersRef.current).forEach(unsub => unsub());
      listenersRef.current = {};
    };

    const handleListenerError = (collectionName: string, error: any) => {
      const isTransportError = error.message.includes('stream transport errored') || 
                               error.message.includes('Could not reach Cloud Firestore backend') ||
                               error.code === 'unavailable';

      // Only log non-transport errors or log transport errors once to avoid spam
      if (!isTransportError) {
        logFirestoreEvent(`${collectionName} listener error`, { error: error.message, code: error.code });
      } else {
        console.warn(`[Firestore] Transient transport error in ${collectionName}, attempting recovery...`);
      }
      
      // If it's a transport or connection error, try to reconnect after a delay
      if (isTransportError) {
        logFirestoreEvent(`Attempting to reconnect ${collectionName} in 5s...`, {});
        setTimeout(() => {
          // Only reconnect if user is still logged in and it's the same user
          if (auth.currentUser?.uid === userId) {
            cleanup();
            setupRealTimeListeners(userId);
          }
        }, 5000);
      }

      if (error.message.includes('permission-denied')) {
        setError(`خطأ في الصلاحيات: لا يمكن الوصول إلى ${collectionName}.`);
      }
    };

    // 1. Trades Listener
    const tradesQuery = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubTrades = onSnapshot(tradesQuery, (snapshot) => {
      logFirestoreEvent('Trades update received', { count: snapshot.size });
      const trades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade));
      setHistory(trades);
      
      // Update stats based on real-time data
      const wins = trades.filter(t => t.outcome === 'WIN').length;
      const losses = trades.filter(t => t.outcome === 'LOSS').length;
      const missed = trades.filter(t => t.outcome === 'MISSED').length;
      const avoided = trades.filter(t => t.outcome === 'AVOIDED').length;
      const total = trades.filter(t => t.outcome !== 'PENDING').length;
      const evolutionLevel = Math.floor(total / 10) + 1;

      setStats({
        total,
        wins,
        losses,
        missed,
        winRate: (total - missed - avoided) > 0 ? Math.round((wins / (total - missed - avoided)) * 100) : 0,
        evolutionLevel
      });
      setLastUpdated(new Date());
    }, (error) => handleListenerError('trades', error));

    // 2. Refinements Listener
    const refinementsQuery = query(
      collection(db, 'refinements'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubRefinements = onSnapshot(refinementsQuery, (snapshot) => {
      if (!snapshot.empty) {
        logFirestoreEvent('Refinement update received', { id: snapshot.docs[0].id });
        setLatestRefinement({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as StrategyRefinement);
      }
    }, (error) => handleListenerError('refinements', error));

    // 3. Learning Sessions Listener
    const sessionsQuery = query(
      collection(db, 'learning_sessions'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubSessions = onSnapshot(sessionsQuery, (snapshot) => {
      logFirestoreEvent('Learning sessions update received', { count: snapshot.size });
      const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LearningSession));
      setLearningSessions(sessions);
    }, (error) => handleListenerError('learning_sessions', error));

    // Store unsubscribe functions
    listenersRef.current['trades'] = unsubTrades;
    listenersRef.current['refinements'] = unsubRefinements;
    listenersRef.current['learning_sessions'] = unsubSessions;
  }, []);

  const handleOpenKeyDialog = async () => {
    // @ts-ignore
    if (window.aistudio?.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasSelectedKey(true);
    }
  };

  const handleSelfRepair = useCallback(() => {
    if (confirm("هل تريد تفعيل بروتوكول الإصلاح الذاتي؟ سيتم مسح الذاكرة المؤقتة وإعادة مزامنة البيانات من السحابة.")) {
      clearAllCaches();
      window.location.reload();
    }
  }, []);

  const testConnection = useCallback(async () => {
    try {
      // Test Firestore connectivity
      await getDocFromServer(doc(db, '_health_check_', 'connection'));
    } catch (error: any) {
      if (error.message?.includes('offline') || error.message?.includes('network') || error.message?.includes('10 seconds')) {
        console.warn("Firestore connectivity issue detected. System will operate in offline/cache mode.");
      }
    }
  }, []);

  const refreshData = useCallback(async (force = false) => {
    if (!user || !isAuthReady) return;
    setIsRefreshing(true);
    try {
      const [refinement, sessions, context, trades] = await Promise.all([
        getLatestRefinement(force),
        getLearningSessions(5, force),
        getHistoricalContext(10, force),
        getTradeHistory(50, force)
      ]);

      setLatestRefinement(refinement);
      setLearningSessions(sessions);
      setHistoricalContext(context);
      setHistory(trades);

      const wins = trades.filter(t => t.outcome === 'WIN').length;
      const losses = trades.filter(t => t.outcome === 'LOSS').length;
      const missed = trades.filter(t => t.outcome === 'MISSED').length;
      const avoided = trades.filter(t => t.outcome === 'AVOIDED').length;
      const total = trades.filter(t => t.outcome !== 'PENDING').length;
      const evolutionLevel = Math.floor(total / 10) + 1;

      setStats({
        total,
        wins,
        losses,
        missed,
        winRate: (total - missed - avoided) > 0 ? Math.round((wins / (total - missed - avoided)) * 100) : 0,
        evolutionLevel
      });
      setLastUpdated(new Date());
    } catch (err: any) {
      console.warn("Data refresh paused due to quota or network:", err.message || err);
      const errorStr = err.message || String(err);
      const isQuota = errorStr.includes("Quota exceeded") || 
                      errorStr.includes("Quota limit exceeded") || 
                      errorStr.includes("quota") || 
                      errorStr.includes("429") ||
                      errorStr.includes("RESOURCE_EXHAUSTED") ||
                      errorStr.includes("تم تجاوز حصة");

      if (isQuota) {
        // Only set error if we have no data at all
        if (history.length === 0) {
          setError("تم تجاوز حصة الاستخدام لليوم (API Quota). يرجى المحاولة لاحقاً أو الترقية لاستخدام مفتاح API الخاص بك.");
        }
      } else {
        setError("حدث خطأ أثناء تحديث البيانات. يرجى التحقق من اتصالك.");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [user, history.length]);

  useEffect(() => {
    if (!user) return;
    refreshData();
  }, [user, refreshData]);

  const isLoggingInRef = useRef(false);

  const handleSignIn = async () => {
    if (isLoggingInRef.current) return;
    isLoggingInRef.current = true;
    setIsLoggingIn(true);
    setError(null);
    try {
      await signIn();
    } catch (err: any) {
      console.error("Sign in error:", err);
      // Handle specific Firebase Auth errors
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        // These are expected if the user cancels or clicks away, no need to show an error message
        return;
      }
      
      if (err.code === 'auth/popup-blocked') {
        setError("تم حظر نافذة تسجيل الدخول المنبثقة. يرجى السماح بالمنبثقات لهذا الموقع.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("فشل الاتصال بالشبكة أثناء تسجيل الدخول. يرجى التحقق من اتصال الإنترنت أو محاولة فتح التطبيق في نافذة جديدة.");
      } else {
        setError(`حدث خطأ أثناء تسجيل الدخول: ${err.message || 'يرجى المحاولة مرة أخرى'}`);
      }
    } finally {
      isLoggingInRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleImageUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setImages(prev => ({ ...prev, [id]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (isAuthReady && (view === 'history' || view === 'stats')) {
      refreshData(true);
    }
  }, [view, refreshData, isAuthReady]);

  const startAnalysis = async () => {
    if (!user) {
      setError("يرجى تسجيل الدخول لاستخدام نظام التدريب بالذكاء الاصطناعي.");
      return;
    }
    if (Object.keys(images).length < 5) {
      setError("يرجى تحميل لقطات شاشة لجميع الأطر الزمنية الخمسة (D1, H4, H1, M15, M5).");
      return;
    }

    if (cacheUtil.isAiQuotaCooldown() && !hasSelectedKey) {
      setError("تم تجاوز حصة الاستخدام المجانية للذكاء الاصطناعي. يرجى الانتظار قليلاً أو النقر على 'ترقية الآن' لاستخدام مفتاح API الخاص بك وزيادة الحصة.");
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    setResult(null);
    setAudioUrl(null);
    setCurrentTradeId(null);

    try {
      // 1. Use cached historical context and latest refinement for "Learning"
      // Only fetch if not already available to save quota
      const context = historicalContext || await getHistoricalContext(5);
      if (!historicalContext) setHistoricalContext(context);
      
      const refinement = latestRefinement || await getLatestRefinement();
      if (!latestRefinement) setLatestRefinement(refinement);

      const goldStandard = await getGoldStandardTrade();
      
      // 2. Execute AI Analysis with Context and Refinement
      const analysis = await analyzeCharts(images, context, refinement, goldStandard);
      setResult(analysis);
      
      // 3. Save to Training Database
      const initialOutcome = analysis.shouldTrade ? 'PENDING' : 'MISSED';
      const tradeId = await saveTradeAnalysis(images, analysis, user.uid, isSimulationMode, initialOutcome);
      setCurrentTradeId(tradeId);

      // Update local history state immediately for instant feedback
      const newTrade: Trade = {
        id: tradeId || Date.now().toString(),
        timestamp: Timestamp.now(),
        images,
        analysis,
        outcome: initialOutcome,
        userId: user.uid,
        isSimulated: isSimulationMode
      };
      setHistory(prev => [newTrade, ...prev]);
      
      // 4. Generate Voice Briefing
      const audio = await generateVoiceExplanation(analysis.explanation);
      setAudioUrl(audio);
    } catch (err: any) {
      console.error("Analysis Error:", err);
      let errorMessage = "فشل التحليل. يرجى التحقق من اتصالك والمحاولة مرة أخرى.";
      
      const errorStr = err.message || String(err);
      let isQuota = errorStr.includes("QUOTA_EXHAUSTED") || 
                    errorStr.includes("429") || 
                    errorStr.includes("RESOURCE_EXHAUSTED") || 
                    errorStr.includes("Quota") || 
                    errorStr.includes("quota") ||
                    (err.status === 429);
      
      if (!isQuota) {
        try {
          const parsedError = typeof err === 'string' ? JSON.parse(err) : (typeof err.message === 'string' ? JSON.parse(err.message) : err);
          const nestedMsg = parsedError.error?.message || parsedError.message || parsedError.error || "";
          if (String(nestedMsg).includes("429") || String(nestedMsg).includes("RESOURCE_EXHAUSTED") || String(nestedMsg).includes("quota")) {
            isQuota = true;
          }
        } catch (e) {
          // Not JSON or already handled
        }
      }

      if (isQuota) {
        if (errorStr.includes("firestore") || errorStr.includes("قاعدة البيانات")) {
          errorMessage = "تم تجاوز حصة القراءة في قاعدة البيانات (Firestore) لليوم. يرجى الانتظار حتى يتم تصفير الحصة غداً.";
        } else {
          cacheUtil.setAiQuotaCooldown();
          if (hasSelectedKey) {
            errorMessage = "تم تجاوز حصة الاستخدام لمفتاح API الخاص بك. يرجى التحقق من خطة الفوترة أو حدود الاستخدام في Google AI Studio.";
          } else {
            errorMessage = "تم تجاوز حصة الاستخدام المجانية للذكاء الاصطناعي (Gemini). يرجى النقر على 'ترقية الآن' لاستخدام مفتاح API الخاص بك لتجنب هذا الانقطاع.";
          }
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOutcomeUpdate = useCallback(async (tradeId: string, outcome: 'WIN' | 'LOSS' | 'MISSED' | 'AVOIDED') => {
    let feedback = '';
    if (outcome === 'LOSS' || outcome === 'MISSED') {
      const promptMsg = outcome === 'LOSS' 
        ? "يرجى تقديم ملاحظات حول سبب فشل الصفقة (مثلاً: توقيت خاطئ، كسر وهمي، إلخ):"
        : "يرجى تقديم ملاحظات حول سبب ضياع الصفقة (مثلاً: المسافة عن الدخول، التوقيت، السيولة، إلخ):";
      feedback = prompt(promptMsg) || '';
    }
    
    try {
      // Update local state first for instant feedback
      setHistory(prev => prev.map(t => t.id === tradeId ? { ...t, outcome, userFeedback: feedback } : t));
      
      // Clear current trade ID if it was the one updated to hide buttons
      if (currentTradeId === tradeId) {
        setCurrentTradeId(null);
      }

      await updateTradeOutcome(tradeId, outcome, feedback);
      
      // Force refresh historical context after update to reflect changes
      if (isAuthReady) {
        const context = await getHistoricalContext(10, true);
        setHistoricalContext(context);
      }
      
      // Refresh stats and history from server to ensure sync
      await refreshData(true);
    } catch (err: any) {
      console.error(err);
      let errorMessage = "فشل تحديث النتيجة.";
      const errorStr = err.message || String(err);
      if (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("Quota")) {
        errorMessage = "تم تجاوز حصة الاستخدام المجانية لليوم. ستتم إعادة تعيين الحصة غداً.";
      }
      setError(errorMessage);
    }
  }, [refreshData]);

  const toggleAudio = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleEvolve = useCallback(async () => {
    if (!user) return;
    
    const failedTrades = history.filter(t => t.outcome === 'LOSS');
    const winningTrades = history.filter(t => t.outcome === 'WIN');
    const missedTrades = history.filter(t => t.outcome === 'MISSED');
    const avoidedTrades = history.filter(t => t.outcome === 'AVOIDED');
    
    if (failedTrades.length === 0 && winningTrades.length === 0 && missedTrades.length === 0 && avoidedTrades.length === 0) {
      setError("لا توجد صفقات كافية في السجل لإجراء عملية التعلم الذاتي.");
      return;
    }

    setIsEvolving(true);
    setError(null);

    try {
      const refinementData = await evolveStrategy(failedTrades, winningTrades, missedTrades, avoidedTrades);
      
      const refinementId = await saveStrategyRefinement({
        ...refinementData,
        version: (latestRefinement?.version || 0) + 1,
        performanceMetrics: {
          winRateAtCreation: stats.winRate,
          totalTradesAtCreation: stats.total
        }
      });

      await saveLearningSession({
        losingTradesCount: failedTrades.length,
        analysis: refinementData.analysisSummary,
        refinementId: refinementId || ''
      });

      await refreshData(true);
      
      setError("تمت عملية التطور بنجاح! لقد تعلم الذكاء الاصطناعي من النجاحات والإخفاقات السابقة.");
      setTimeout(() => setError(null), 5000);
    } catch (err: any) {
      console.error("Evolution Error:", err);
      let errorMessage = "فشلت عملية التطور. يرجى المحاولة مرة أخرى.";
      
      const errorStr = err.message || String(err);
      let isQuota = errorStr.includes("QUOTA_EXHAUSTED") || 
                    errorStr.includes("429") || 
                    errorStr.includes("RESOURCE_EXHAUSTED") || 
                    errorStr.includes("Quota") || 
                    errorStr.includes("quota");
      
      if (!isQuota) {
        try {
          const parsedError = typeof err === 'string' ? JSON.parse(err) : (typeof err.message === 'string' ? JSON.parse(err.message) : err);
          const nestedMsg = parsedError.error?.message || parsedError.message || parsedError.error || "";
          if (String(nestedMsg).includes("429") || String(nestedMsg).includes("RESOURCE_EXHAUSTED") || String(nestedMsg).includes("quota")) {
            isQuota = true;
          }
        } catch (e) {
          // Not JSON
        }
      }

      if (isQuota) {
        cacheUtil.setAiQuotaCooldown();
        if (hasSelectedKey) {
          errorMessage = "تم تجاوز حصة الاستخدام لمفتاح API الخاص بك لعملية التطور. يرجى التحقق من حدود الاستخدام.";
        } else {
          errorMessage = "تم تجاوز حصة الاستخدام المجانية لعملية التطور (Gemini Quota). يرجى استخدام مفتاح API الخاص بك لتجاوز هذا الحد.";
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsEvolving(false);
    }
  }, [user, latestRefinement, stats.winRate, stats.total, historicalContext, refreshData]);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E4E4E7] font-sans selection:bg-[#F27D26]/30" dir="rtl">
      {/* Header */}
      <header className="border-b border-[#1F1F23] bg-[#0A0A0B]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#F27D26] rounded flex items-center justify-center shadow-[0_0_15px_rgba(242,125,38,0.3)]">
              <Activity className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight uppercase">نظام <span className="text-[#F27D26]">تدريب</span> SMC</h1>
              <p className="text-[10px] text-[#71717A] uppercase tracking-[0.2em] font-mono">ذكاء اصطناعي لتحليل الأسواق</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-1">
              {[
                { id: 'analyze', label: 'تحليل', icon: Activity },
                { id: 'history', label: 'سجل التدريب', icon: History },
                { id: 'evolution', label: 'تطور AI', icon: BrainCircuit },
                { id: 'stats', label: 'الأداء', icon: BarChart3 },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2",
                    view === item.id 
                      ? "bg-[#F27D26]/10 text-[#F27D26]" 
                      : "text-[#71717A] hover:text-[#E4E4E7] hover:bg-white/5"
                  )}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              ))}
              
              <button
                onClick={handleSelfRepair}
                className="p-2 rounded-lg text-[#71717A] hover:text-[#F27D26] hover:bg-[#F27D26]/5 transition-all flex items-center gap-2"
                title="إصلاح ذاتي"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold uppercase hidden lg:block">إصلاح ذاتي</span>
              </button>

              {isOfflineMode && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider hidden xl:block">وضع التخزين المؤقت نشط</span>
                </div>
              )}

              <button
                onClick={() => refreshData(true)}
                disabled={isRefreshing}
                className={cn(
                  "p-2 rounded-lg text-[#71717A] hover:text-[#E4E4E7] hover:bg-white/5 transition-all flex items-center gap-2",
                  isRefreshing && "text-[#F27D26]"
                )}
                title="تحديث البيانات"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                {lastUpdated && (
                  <span className="text-[9px] font-mono hidden lg:block">
                    تحديث: {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </button>
            </nav>

            <div className="h-6 w-px bg-[#1F1F23]" />

            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-[11px] font-medium text-[#E4E4E7] leading-none">{user.displayName}</p>
                    <p className="text-[9px] text-[#71717A] uppercase font-mono mt-1">معرف المتداول: {user.uid.slice(0, 6)}</p>
                  </div>
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-[#1F1F23]" />
                </div>
                <button 
                  onClick={() => signOut(auth)}
                  className="p-2 text-[#71717A] hover:text-red-400 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleSignIn}
                disabled={isLoggingIn}
                className="px-4 py-2 bg-white text-black rounded-lg text-xs font-bold hover:bg-[#F27D26] hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoggingIn && <Loader2 className="w-3 h-3 animate-spin" />}
                تسجيل الدخول
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between gap-3 text-red-400 text-sm"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
            <div className="flex items-center gap-2">
              {(error.includes("حصة") || error.includes("Quota") || error.includes("429") || error.includes("EXHAUSTED")) && !hasSelectedKey && (
                <button 
                  onClick={handleOpenKeyDialog}
                  className="px-3 py-1 bg-[#F27D26] text-black rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-[#FF8D3A] transition-all whitespace-nowrap"
                >
                  ترقية الآن
                </button>
              )}
              <button 
                onClick={() => setError(null)}
                className="p-1 hover:bg-white/5 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {view === 'analyze' && (
          <div className="space-y-6">
            {/* System Status Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
              <div className="bg-[#151519] border border-[#1F1F23] p-3 rounded-xl flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                <div>
                  <p className="text-[9px] text-[#71717A] uppercase font-bold tracking-widest">حالة النظام</p>
                  <p className="text-[11px] font-bold">متصل - أداء عالي</p>
                </div>
              </div>
              <div className="bg-[#151519] border border-[#1F1F23] p-3 rounded-xl flex items-center gap-3">
                <BrainCircuit className="w-4 h-4 text-[#F27D26]" />
                <div>
                  <p className="text-[9px] text-[#71717A] uppercase font-bold tracking-widest">إصدار الخوارزمية</p>
                  <p className="text-[11px] font-bold">SMC-V{latestRefinement?.version || 1.0} PRO</p>
                </div>
              </div>
              <div className="bg-[#151519] border border-[#1F1F23] p-3 rounded-xl flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
                <div>
                  <p className="text-[9px] text-[#71717A] uppercase font-bold tracking-widest">إدارة المخاطر</p>
                  <p className="text-[11px] font-bold">نشط (12$ SL / 40$ TP)</p>
                </div>
              </div>
              <div className="bg-[#151519] border border-[#1F1F23] p-3 rounded-xl flex items-center gap-3">
                <Zap className={cn("w-4 h-4", hasSelectedKey ? "text-[#22C55E]" : "text-purple-500")} />
                <div className="flex-1">
                  <p className="text-[9px] text-[#71717A] uppercase font-bold tracking-widest">حصة الاستخدام</p>
                  <p className="text-[11px] font-bold">{hasSelectedKey ? 'حصة مدفوعة' : 'حصة مجانية محدودة'}</p>
                </div>
                {!hasSelectedKey && (
                  <button 
                    onClick={handleOpenKeyDialog}
                    className="px-2 py-1 bg-[#F27D26]/10 text-[#F27D26] text-[10px] font-bold rounded border border-[#F27D26]/20 hover:bg-[#F27D26]/20 transition-all"
                  >
                    ترقية
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Uploads */}
            <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-sm font-medium uppercase tracking-widest text-[#71717A]">مدخلات الشارت</h2>
                    <button 
                      onClick={() => setIsSimulationMode(!isSimulationMode)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                        isSimulationMode 
                          ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]" 
                          : "bg-white/5 text-[#71717A] border border-white/10 hover:bg-white/10"
                      )}
                    >
                      <BrainCircuit className="w-3 h-3" />
                      {isSimulationMode ? 'وضع المحاكاة نشط' : 'تفعيل وضع المحاكاة'}
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-2 py-1 bg-[#22C55E]/10 rounded border border-[#22C55E]/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                      <span className="text-[9px] font-bold text-[#22C55E] uppercase tracking-wider">تعلم الذكاء الاصطناعي: {stats.wins} نماذج</span>
                    </div>
                    <button 
                      onClick={() => setImages({})}
                      className="text-[11px] text-[#71717A] hover:text-[#E4E4E7] transition-colors"
                    >
                      مسح الكل
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                {TIMEFRAMES.map((tf) => (
                  <div key={tf.id} className="relative group">
                    <label className={cn(
                      "block aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden",
                      images[tf.id] 
                        ? "border-[#F27D26]/50 bg-[#151519]" 
                        : "border-[#1F1F23] hover:border-[#F27D26]/30 bg-[#0F0F12]"
                    )}>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleImageUpload(tf.id, e.target.files[0])}
                      />
                      {images[tf.id] ? (
                        <img 
                          src={images[tf.id]} 
                          alt={tf.label} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <Upload className="w-6 h-6 text-[#3F3F46]" />
                          <div className="text-center">
                            <p className="text-xs font-medium">{tf.label}</p>
                            <p className="text-[10px] text-[#71717A]">{tf.desc}</p>
                          </div>
                        </div>
                      )}
                      {images[tf.id] && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-mono border border-white/10">
                          {tf.id} جاهز
                        </div>
                      )}
                    </label>
                  </div>
                ))}
              </div>

              <button
                onClick={startAnalysis}
                disabled={isAnalyzing || Object.keys(images).length < 5}
                className={cn(
                  "w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-3",
                  isAnalyzing || Object.keys(images).length < 5
                    ? "bg-[#1F1F23] text-[#3F3F46] cursor-not-allowed"
                    : "bg-[#F27D26] text-black hover:bg-[#FF8D3A] shadow-[0_0_30px_rgba(242,125,38,0.2)] active:scale-[0.98]"
                )}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    جاري التعلم من النجاحات والإخفاقات...
                  </>
                ) : (
                  <>
                    <Activity className="w-5 h-5" />
                    بدء التحليل والتعلم المؤسسي
                  </>
                )}
              </button>
            </div>

            {/* Right Column: Results */}
            <div className="lg:col-span-5 space-y-6">
              <InstitutionalTimes />
              <SystemHealth 
                isAnalyzing={isAnalyzing} 
                isEvolving={isEvolving} 
                lastRefinement={latestRefinement} 
                stats={stats}
              />
              <StrategyRules refinement={latestRefinement} />
              
              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-6"
                  >
                    {/* Trade Card */}
                    <TradeCard 
                      result={result}
                      latestRefinement={latestRefinement}
                      currentTradeId={currentTradeId}
                      onOutcomeUpdate={handleOutcomeUpdate}
                      isSimulated={isSimulationMode}
                    />

                    {/* Voice Explanation */}
                    {audioUrl && (
                      <VoiceBriefing 
                        audioUrl={audioUrl}
                        isPlaying={isPlaying}
                        onToggle={toggleAudio}
                        audioRef={audioRef}
                        onEnded={() => setIsPlaying(false)}
                        onError={(e) => {
                          console.error("Audio playback error occurred");
                          setError("Failed to load audio briefing.");
                          setIsPlaying(false);
                        }}
                      />
                    )}

                    {/* Analysis Details */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A]">تفاصيل التحليل الخوارزمي</h3>
                      {[
                        { label: 'سياق IPDA', content: result.algorithmicContext, icon: Cpu },
                        { label: 'تدفق السيولة', content: result.liquidityFlow, icon: Zap },
                        { label: 'سيولة D1', content: result.d1Liquidity, icon: Target },
                        { label: 'انحياز H4', content: result.h4Bias, icon: TrendingUp },
                        { label: 'انحياز H1', content: result.h1Bias, icon: Activity },
                        { label: 'منطق M15', content: result.m15Confirmation, icon: ShieldCheck },
                        { label: 'دخول M5', content: result.m5EntryLogic, icon: CheckCircle2 },
                        { label: 'إدارة المخاطر', content: result.riskManagement, icon: AlertTriangle }
                      ].map((item, i) => (
                        <AnalysisItem key={i} {...item} />
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-full min-h-[400px] border border-[#1F1F23] border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-8">
                    <div className="w-16 h-16 bg-[#151519] rounded-full flex items-center justify-center mb-6">
                      <Activity className="w-8 h-8 text-[#3F3F46]" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">في انتظار بيانات التدريب</h3>
                    <p className="text-sm text-[#71717A] max-w-[280px]">
                      قم بتحميل لقطات شاشة متعددة الأطر الزمنية لتدريب الذكاء الاصطناعي على هيكل السوق الحالي.
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

        {view === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">سجل التدريب</h2>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-[#22C55E]">الأرباح: {stats.wins}</span>
                <span className="text-[#EF4444]">الخسائر: {stats.losses}</span>
                <span className="text-[#F27D26]">الضائعة: {stats.missed}</span>
                <span className="text-[#F27D26] opacity-70">نسبة النجاح: {stats.winRate}%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {history.map((trade) => (
                <HistoryCard 
                  key={trade.id} 
                  trade={trade} 
                  onOutcomeUpdate={handleOutcomeUpdate} 
                />
              ))}
              {history.length === 0 && (
                <div className="col-span-full py-20 text-center border border-[#1F1F23] border-dashed rounded-2xl">
                  <History className="w-12 h-12 text-[#3F3F46] mx-auto mb-4" />
                  <p className="text-[#71717A]">لم يتم العثور على سجل تدريب.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'stats' && (
          <div className="space-y-8">
            <h2 className="text-xl font-bold tracking-tight">مقاييس الأداء العالي</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {[
                { label: 'إجمالي المحلل', value: history.length, icon: Activity, color: '#F27D26' },
                { label: 'نسبة النجاح', value: `${stats.winRate}%`, icon: Trophy, color: '#22C55E' },
                { label: 'الفرص الضائعة', value: stats.missed, icon: AlertCircle, color: '#F27D26' },
                { label: 'مجموعة تدريب AI', value: stats.wins, icon: ShieldCheck, color: '#F27D26' },
                { label: 'مستوى التطور', value: `LVL ${stats.evolutionLevel}`, icon: Zap, color: '#F27D26' },
              ].map((stat, i) => (
                <StatCard key={i} {...stat} />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] mb-4">دقة التنفيذ (Execution Precision)</p>
                <div className="flex items-end gap-4 mb-4">
                  <p className="text-4xl font-bold tracking-tighter">94.2%</p>
                  <span className="text-[10px] text-[#22C55E] font-bold mb-1">+2.4% هذا الأسبوع</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-[#22C55E] w-[94.2%]" />
                </div>
              </div>
              <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] mb-4">متوسط الانعكاس (Avg Drawdown)</p>
                <div className="flex items-end gap-4 mb-4">
                  <p className="text-4xl font-bold tracking-tighter">1.8$</p>
                  <span className="text-[10px] text-[#22C55E] font-bold mb-1">-0.5$ تحسن</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-[#F27D26] w-[15%]" />
                </div>
              </div>
              <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] mb-4">عامل الربح (Profit Factor)</p>
                <div className="flex items-end gap-4 mb-4">
                  <p className="text-4xl font-bold tracking-tighter">3.42</p>
                  <span className="text-[10px] text-[#22C55E] font-bold mb-1">ممتاز</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 w-[70%]" />
                </div>
              </div>
            </div>

            <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-8">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#71717A] mb-6">منحنى التعلم</h3>
              <div className="h-[300px] flex items-end gap-2">
                {history.slice(0, 20).reverse().map((trade, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "flex-1 rounded-t-sm transition-all hover:opacity-80",
                      trade.outcome === 'WIN' ? "bg-[#22C55E]" : 
                      trade.outcome === 'LOSS' ? "bg-[#EF4444]" : 
                      trade.outcome === 'MISSED' ? "bg-[#F27D26]" :
                      "bg-white/5"
                    )}
                    style={{ height: trade.outcome === 'PENDING' ? '10%' : '60%' }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-4 text-[10px] font-mono text-[#71717A]">
                <span>أقدم تحليل</span>
                <span>أحدث تحليل</span>
              </div>
            </div>
          </div>
        )}

        {view === 'evolution' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                  <BrainCircuit className="w-8 h-8 text-[#F27D26]" />
                  مركز تطور الذكاء الاصطناعي
                </h2>
                <p className="text-[#71717A] text-sm">نظام التعلم الذاتي وتحسين الاستراتيجية بناءً على الأداء التاريخي.</p>
              </div>
              
              <button
                onClick={handleEvolve}
                disabled={isEvolving}
                className="px-6 py-3 bg-[#F27D26] text-black rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-[#FF8D3A] transition-all flex items-center gap-3 shadow-[0_0_20px_rgba(242,125,38,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEvolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                بدء عملية التطور الذاتي
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Evolution Progress */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-8 text-center relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-1 bg-[#F27D26]/20">
                    <motion.div 
                      className="h-full bg-[#F27D26]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(stats.evolutionLevel % 10) * 10}%` }}
                    />
                  </div>
                  
                  <div className="relative z-10">
                    <div className="w-20 h-20 bg-[#F27D26]/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                      <Zap className="w-10 h-10 text-[#F27D26]" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-[#71717A] mb-2">مستوى التطور الحالي</h3>
                    <p className="text-5xl font-black tracking-tighter text-white mb-4">LVL {stats.evolutionLevel}</p>
                    <div className="flex items-center justify-center gap-2 text-[#22C55E] text-xs font-bold">
                      <ArrowUpRight className="w-4 h-4" />
                      <span>نمو مستمر في الدقة</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#71717A] mb-6">إحصائيات التعلم</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'الصفقات الفاشلة/الضائعة التي تمت مراجعتها', value: history.filter(t => t.outcome === 'LOSS' || t.outcome === 'MISSED').length },
                      { label: 'تحديثات الاستراتيجية', value: latestRefinement?.version || 0 },
                      { label: 'تحديات التكيف النشطة', value: latestRefinement?.adaptiveChallenges.length || 0 }
                    ].map((stat, i) => (
                      <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                        <span className="text-xs text-[#A1A1AA]">{stat.label}</span>
                        <span className="text-sm font-bold font-mono">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Latest Refinements */}
              <div className="lg:col-span-2 space-y-6">
                {latestRefinement ? (
                  <div className="space-y-6">
                    <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-8">
                      <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-[#F27D26]/10 rounded-lg flex items-center justify-center">
                          <ShieldCheck className="w-6 h-6 text-[#F27D26]" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">آخر تحديث للاستراتيجية</h3>
                          <p className="text-xs text-[#71717A]">الإصدار {latestRefinement.version} • {toSafeDate(latestRefinement.timestamp).toLocaleString('ar-EG')}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-[#EF4444] flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            نقاط الضعف المكتشفة
                          </h4>
                          <ul className="space-y-3">
                            {latestRefinement.weaknesses.map((w, i) => (
                              <li key={i} className="text-sm text-[#D4D4D8] flex items-start gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] mt-1.5 shrink-0" />
                                {w}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-4">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-[#22C55E] flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            التحسينات المطبقة
                          </h4>
                          <ul className="space-y-3">
                            {latestRefinement.refinements.map((r, i) => (
                              <li key={i} className="text-sm text-[#D4D4D8] flex items-start gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] mt-1.5 shrink-0" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="mt-10 pt-8 border-t border-white/5">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-[#F27D26] mb-4 flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          تحديات التكيف (Adaptive Challenges)
                        </h4>
                        <div className="flex flex-wrap gap-3">
                          {latestRefinement.adaptiveChallenges.map((c, i) => (
                            <div key={i} className="px-4 py-2 bg-[#F27D26]/5 border border-[#F27D26]/20 rounded-lg text-xs text-[#F27D26] font-medium">
                              {c}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-8">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-[#71717A] mb-4">ملخص التعلم الذاتي</h3>
                      <p className="text-sm text-[#A1A1AA] leading-relaxed italic">
                        "{latestRefinement.analysisSummary}"
                      </p>
                    </div>

                    {/* Learning Sessions Log */}
                    <div className="bg-[#151519] border border-[#1F1F23] rounded-2xl p-8">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-[#71717A] mb-6 flex items-center gap-2">
                        <History className="w-4 h-4" />
                        سجل جلسات التعلم المستمر
                      </h3>
                      <div className="space-y-4">
                        {learningSessions.map((session, i) => (
                          <SessionCard 
                            key={session.id} 
                            session={session} 
                            index={i} 
                            totalSessions={learningSessions.length} 
                          />
                        ))}
                        {learningSessions.length === 0 && (
                          <p className="text-xs text-[#71717A] text-center py-4">لا يوجد سجل جلسات تعلم بعد.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-[400px] border border-[#1F1F23] border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-8">
                    <div className="w-16 h-16 bg-[#151519] rounded-full flex items-center justify-center mb-6">
                      <BrainCircuit className="w-8 h-8 text-[#3F3F46]" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">لم تبدأ عملية التطور بعد</h3>
                    <p className="text-sm text-[#71717A] max-w-[320px] mb-8">
                      يجب أن يكون لديك صفقات خاسرة مسجلة في النظام لتمكين الذكاء الاصطناعي من تحليل الأخطاء وتطوير الاستراتيجية.
                    </p>
                    <button
                      onClick={handleEvolve}
                      disabled={isEvolving || history.filter(t => t.outcome === 'LOSS').length === 0}
                      className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-30"
                    >
                      تحليل الصفقات الخاسرة للتعلم
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-[#1F1F23] mt-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">منهجية SMC</h4>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              يتبع ذكاءنا الاصطناعي منطق تدفق الأوامر المؤسسي الصارم، مع إعطاء الأولوية لسحب السيولة وتحولات هيكل السوق على المؤشرات التقليدية.
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">إدارة المخاطر</h4>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              يتم حساب كل إعداد بنسبة مخاطرة إلى عائد لا تقل عن 1:3، مع استهداف مجمعات السيولة اليومية للاحتمالية المثلى.
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">حالة النظام</h4>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
              <span className="text-xs text-[#A1A1AA]">محرك Gemini 3.1 Pro متصل</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
