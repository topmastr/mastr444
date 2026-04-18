import { Timestamp } from 'firebase/firestore';
import { AnalysisResult } from './services/gemini';

export interface Trade {
  id: string;
  timestamp: Timestamp;
  images: { [key: string]: string };
  analysis: AnalysisResult;
  outcome: 'WIN' | 'LOSS' | 'PENDING' | 'MISSED' | 'AVOIDED';
  userId: string;
  userFeedback?: string;
  lastUpdated?: Timestamp;
  isSimulated?: boolean;
  accuracyScore?: number;
}

export interface StrategyRefinement {
  id: string;
  timestamp: Timestamp;
  weaknesses: string[];
  refinements: string[];
  adaptiveChallenges: string[];
  analysisSummary: string;
  version: number;
  performanceMetrics?: {
    winRateAtCreation: number;
    totalTradesAtCreation: number;
  };
}

export interface LearningSession {
  id: string;
  timestamp: Timestamp;
  losingTradesCount: number;
  analysis: string;
  refinementId: string;
}

export interface Stats {
  total: number;
  wins: number;
  losses: number;
  missed: number;
  winRate: number;
  evolutionLevel: number;
}
