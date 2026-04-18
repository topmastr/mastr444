import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, setPersistence, browserLocalPersistence, type User as FirebaseUser } from 'firebase/auth';
import { initializeFirestore, collection, addDoc, query, orderBy, limit, getDocs, where, Timestamp, doc, updateDoc, getDoc, getDocFromServer, setDoc, getDocsFromCache, getDocsFromServer } from 'firebase/firestore';
import { Trade, StrategyRefinement, LearningSession } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with forced long polling to resolve connectivity issues in restricted/sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' ? firebaseConfig.firestoreDatabaseId : undefined);

export const auth = getAuth();

// Set persistence to local for better session management
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.error("Auth persistence error:", err);
});

const googleProvider = new GoogleAuthProvider();

export const signIn = () => signInWithPopup(auth, googleProvider);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
  LISTEN = 'listen',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

// Memory cache for the current session
const memoryCache: { [key: string]: { data: any, expiry: number } } = {};

// Helper for localStorage caching with TTL
const cache = {
  set: (key: string, data: any, ttl = 600000) => { // 10 mins default
    const expiry = Date.now() + ttl;
    const entry = { data, expiry };
    
    // Always update memory cache
    memoryCache[key] = entry;

    try {
      // Strip images from trade data before saving to localStorage to avoid quota issues
      let cacheData = data;
      if (key.includes('trade_history') || key.includes('historical_context') || key.includes('failed_trades')) {
        if (Array.isArray(data)) {
          cacheData = data.map(t => ({ ...t, images: {} }));
        } else if (data && typeof data === 'object') {
          if (data.wins) data.wins = data.wins.map((t: any) => ({ ...t, images: {} }));
          if (data.losses) data.losses = data.losses.map((t: any) => ({ ...t, images: {} }));
        }
      }

      const storageEntry = { data: cacheData, expiry };
      localStorage.setItem(`cortex_cache_${key}`, JSON.stringify(storageEntry));
    } catch (e) {
      // If quota exceeded, clear old cache items and try again, or just fail silently
      if (e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.warn("LocalStorage quota exceeded, clearing old cache...");
        cache.clearAll();
      } else {
        console.warn("Cache set error:", e);
      }
    }
  },
  get: (key: string) => {
    // Try memory cache first
    const memEntry = memoryCache[key];
    if (memEntry && Date.now() < memEntry.expiry) {
      return memEntry.data;
    }

    try {
      const item = localStorage.getItem(`cortex_cache_${key}`);
      if (!item) return null;
      const entry = JSON.parse(item);
      if (Date.now() > entry.expiry) {
        localStorage.removeItem(`cortex_cache_${key}`);
        return null;
      }
      // Update memory cache
      memoryCache[key] = entry;
      return entry.data;
    } catch (e) {
      return null;
    }
  },
  getFallback: (key: string) => {
    const memEntry = memoryCache[key];
    if (memEntry) return memEntry.data;

    try {
      const item = localStorage.getItem(`cortex_cache_${key}`);
      return item ? JSON.parse(item).data : null;
    } catch (e) {
      return null;
    }
  },
  clearAll: () => {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('cortex_cache_')) {
        localStorage.removeItem(key);
      }
    });
    // Also clear memory cache
    Object.keys(memoryCache).forEach(key => delete memoryCache[key]);
  },
  setQuotaCooldown: () => {
    localStorage.setItem('cortex_quota_cooldown', (Date.now() + 3600000).toString()); // 1 hour
  },
  isQuotaCooldown: () => {
    const cooldown = localStorage.getItem('cortex_quota_cooldown');
    if (!cooldown) return false;
    if (Date.now() > parseInt(cooldown)) {
      localStorage.removeItem('cortex_quota_cooldown');
      return false;
    }
    return true;
  },
  setAiQuotaCooldown: () => {
    localStorage.setItem('cortex_ai_quota_cooldown', (Date.now() + 1800000).toString()); // 30 mins
  },
  isAiQuotaCooldown: () => {
    const cooldown = localStorage.getItem('cortex_ai_quota_cooldown');
    if (!cooldown) return false;
    if (Date.now() > parseInt(cooldown)) {
      localStorage.removeItem('cortex_ai_quota_cooldown');
      return false;
    }
    return true;
  },
  clear: (key: string) => {
    localStorage.removeItem(`cortex_cache_${key}`);
  }
};

// Export cache utility for AI quota management
export const cacheUtil = cache;

export const clearAllCaches = () => {
  cache.clearAll();
  localStorage.removeItem('cortex_quota_cooldown');
  localStorage.removeItem('cortex_ai_quota_cooldown');
};

export const logFirestoreEvent = (event: string, details: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[Firestore][${timestamp}] ${event}`, details);
};

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  const isQuotaError = message.includes("Quota exceeded") || message.includes("Quota limit exceeded") || message.includes("quota");
  
  if (isQuotaError) {
    cache.setQuotaCooldown();
  }
  
  const errInfo: FirestoreErrorInfo = {
    error: isQuotaError ? "تم تجاوز حصة القراءة/الكتابة المجانية في Firestore لليوم. يرجى الانتظار حتى يتم إعادة تعيين الحصة غداً." : message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  // Only log once to avoid console spam
  if (!isQuotaError) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Helper to fetch documents with automatic fallback to cache on quota errors or network failure.
 */
async function getDocsWithAutoFallback(q: any, cacheKey: string, ttl = 3600000) {
  // If we are in a quota cooldown, try cache immediately
  if (cache.isQuotaCooldown()) {
    try {
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) {
        logFirestoreEvent('Quota cooldown active, using Firestore cache', { key: cacheKey });
        return snapshot;
      }
    } catch (e) {
      // Fallback to our manual cache if Firestore cache fails
    }
  }

  try {
    // Try server first
    const snapshot = await getDocsFromServer(q);
    return snapshot;
  } catch (error: any) {
    const message = error.message || String(error);
    const isQuota = message.includes("Quota exceeded") || message.includes("Quota limit exceeded") || message.includes("quota");
    
    if (isQuota) {
      cache.setQuotaCooldown();
      logFirestoreEvent('Quota hit, falling back to cache', { key: cacheKey });
    }

    try {
      const snapshot = await getDocsFromCache(q);
      if (!snapshot.empty) return snapshot;
    } catch (e) {
      // Ignore cache errors
    }
    
    throw error;
  }
}

export async function saveTradeAnalysis(images: { [key: string]: string }, analysis: any, userId: string, isSimulated = false, outcome: 'WIN' | 'LOSS' | 'MISSED' | 'PENDING' = 'PENDING') {
  const path = 'trades';
  try {
    const docRef = await addDoc(collection(db, path), {
      timestamp: Timestamp.now(),
      images: images || {},
      analysis,
      outcome,
      userId,
      isSimulated,
      accuracyScore: analysis.confidenceScore || 0,
      lastUpdated: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getHistoricalContext(limitCount = 10, forceRefresh = false): Promise<{ wins: Trade[], losses: Trade[], missed: Trade[], avoided: Trade[] }> {
  const path = 'trades';
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    return { wins: [], losses: [], missed: [], avoided: [] };
  }

  const cacheKey = `historical_context_${currentUser.uid}`;
  
  if (!forceRefresh || cache.isQuotaCooldown()) {
    const cached = cache.get(cacheKey) || cache.getFallback(cacheKey);
    if (cached) return cached;
  }

  try {
    // Fetch all 4 types of outcomes
    const winQuery = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      where('outcome', '==', 'WIN'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const lossQuery = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      where('outcome', '==', 'LOSS'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const missedQuery = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      where('outcome', '==', 'MISSED'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const avoidedQuery = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      where('outcome', '==', 'AVOIDED'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const [winSnapshot, lossSnapshot, missedSnapshot, avoidedSnapshot] = await Promise.all([
      getDocsWithAutoFallback(winQuery, `${cacheKey}_wins`),
      getDocsWithAutoFallback(lossQuery, `${cacheKey}_losses`),
      getDocsWithAutoFallback(missedQuery, `${cacheKey}_missed`),
      getDocsWithAutoFallback(avoidedQuery, `${cacheKey}_avoided`)
    ]);

    const result = {
      wins: winSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Trade)),
      losses: lossSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Trade)),
      missed: missedSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Trade)),
      avoided: avoidedSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Trade))
    };
    
    cache.set(cacheKey, result, 3600000); // 1 hour TTL
    return result;
  } catch (error) {
    const cached = cache.getFallback(cacheKey);
    if (cached) return cached;
    
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = message.includes("Quota exceeded") || message.includes("Quota limit exceeded") || message.includes("quota");
    
    if (isQuotaError) {
      cache.setQuotaCooldown();
      return { wins: [], losses: [], missed: [], avoided: [] };
    }
    
    handleFirestoreError(error, OperationType.LIST, path);
    return { wins: [], losses: [], missed: [], avoided: [] };
  }
}

export async function getGoldStandardTrade(): Promise<Trade | null> {
  const path = 'trades';
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const cacheKey = `gold_standard_${currentUser.uid}`;
  if (cache.isQuotaCooldown()) {
    const cached = cache.get(cacheKey) || cache.getFallback(cacheKey);
    if (cached) return cached;
    return null;
  }

  try {
    const q = query(
      collection(db, path),
      where('userId', '==', currentUser.uid),
      where('outcome', '==', 'WIN'),
      orderBy('timestamp', 'asc'),
      limit(1)
    );
    const snapshot = await getDocsWithAutoFallback(q, cacheKey);
    if (snapshot.empty) return null;
    const result = { id: snapshot.docs[0].id, ...(snapshot.docs[0].data() as any) } as Trade;
    cache.set(cacheKey, result, 86400000); // 24 hours TTL for gold standard
    return result;
  } catch (error: any) {
    const message = error.message || String(error);
    if (message.includes("quota") || message.includes("Quota")) {
      cache.setQuotaCooldown();
      const cached = cache.getFallback(cacheKey);
      if (cached) return cached;
    }
    console.warn("Failed to fetch gold standard trade:", error);
    return null;
  }
}

export async function updateTradeOutcome(tradeId: string, outcome: 'WIN' | 'LOSS' | 'MISSED' | 'AVOIDED', feedback?: string) {
  const path = `trades/${tradeId}`;
  try {
    const tradeRef = doc(db, 'trades', tradeId);
    await updateDoc(tradeRef, {
      outcome,
      userFeedback: feedback || '',
      lastUpdated: Timestamp.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getFailedTrades(forceRefresh = false): Promise<Trade[]> {
  const path = 'trades';
  const cacheKey = `failed_trades_${auth.currentUser?.uid}`;
  
  if (!forceRefresh || cache.isQuotaCooldown()) {
    const cached = cache.get(cacheKey) || cache.getFallback(cacheKey);
    if (cached) return cached;
  }

  try {
    // Fetch both LOSS and MISSED trades
    const lossQuery = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      where('outcome', '==', 'LOSS'),
      orderBy('timestamp', 'desc')
    );
    const missedQuery = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      where('outcome', '==', 'MISSED'),
      orderBy('timestamp', 'desc')
    );

    const [lossSnapshot, missedSnapshot] = await Promise.all([
      getDocsWithAutoFallback(lossQuery, `${cacheKey}_loss`),
      getDocsWithAutoFallback(missedQuery, `${cacheKey}_missed`)
    ]);

    const failedTrades = [
      ...lossSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Trade)),
      ...missedSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Trade))
    ];

    // Sort by timestamp descending
    const result = failedTrades.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
    cache.set(cacheKey, result, 3600000); // 1 hour TTL
    return result;
  } catch (error) {
    const cached = cache.getFallback(cacheKey);
    if (cached) return cached;
    
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = message.includes("Quota exceeded") || message.includes("Quota limit exceeded") || message.includes("quota");
    
    if (isQuotaError) {
      cache.setQuotaCooldown();
      return [];
    }
    
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getLosingTrades(): Promise<Trade[]> {
  return getFailedTrades(); // Alias for backward compatibility or update calls
}

export async function saveStrategyRefinement(refinement: Omit<StrategyRefinement, 'id' | 'timestamp'>) {
  const path = 'refinements';
  try {
    const docRef = await addDoc(collection(db, path), {
      ...refinement,
      userId: auth.currentUser?.uid || 'anonymous',
      timestamp: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getLatestRefinement(forceRefresh = false): Promise<StrategyRefinement | null> {
  const path = 'refinements';
  const cacheKey = `latest_refinement_${auth.currentUser?.uid}`;
  
  if (!forceRefresh || cache.isQuotaCooldown()) {
    const cached = cache.get(cacheKey) || cache.getFallback(cacheKey);
    if (cached) return cached;
  }

  try {
    const q = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    const snapshot = await getDocsWithAutoFallback(q, cacheKey);
    if (snapshot.empty) {
      return null;
    }
    const result = { id: snapshot.docs[0].id, ...(snapshot.docs[0].data() as any) } as StrategyRefinement;
    cache.set(cacheKey, result, 3600000); // 1 hour TTL
    return result;
  } catch (error) {
    const cached = cache.getFallback(cacheKey);
    if (cached) return cached;
    
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = message.includes("Quota exceeded") || message.includes("Quota limit exceeded") || message.includes("quota");
    
    if (isQuotaError) {
      cache.setQuotaCooldown();
      return null;
    }
    
    handleFirestoreError(error, OperationType.LIST, path);
    return null;
  }
}

export async function saveLearningSession(session: Omit<LearningSession, 'id' | 'timestamp'>) {
  const path = 'learning_sessions';
  try {
    const docRef = await addDoc(collection(db, path), {
      ...session,
      userId: auth.currentUser?.uid || 'anonymous',
      timestamp: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getLearningSessions(limitCount = 10, forceRefresh = false): Promise<LearningSession[]> {
  const path = 'learning_sessions';
  const cacheKey = `learning_sessions_${auth.currentUser?.uid}`;
  
  if (!forceRefresh || cache.isQuotaCooldown()) {
    const cached = cache.get(cacheKey) || cache.getFallback(cacheKey);
    if (cached) return cached;
  }

  try {
    const q = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocsWithAutoFallback(q, cacheKey);
    const result = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as LearningSession));
    cache.set(cacheKey, result, 3600000); // 1 hour TTL
    return result;
  } catch (error) {
    const cached = cache.getFallback(cacheKey);
    if (cached) return cached;
    
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = message.includes("Quota exceeded") || message.includes("Quota limit exceeded") || message.includes("quota");
    
    if (isQuotaError) {
      cache.setQuotaCooldown();
      return [];
    }
    
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Tracking sync status in current session to avoid redundant calls
let hasSyncedInSession = false;

export async function syncUserProfile(user: FirebaseUser) {
  if (hasSyncedInSession || cache.isQuotaCooldown()) return;

  const path = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    
    // Try to get from server first, but handle quota
    let userSnap;
    try {
      userSnap = await getDocFromServer(userRef);
    } catch (e: any) {
      if (e.message?.includes('quota')) {
        cache.setQuotaCooldown();
        return;
      }
      // If server fails for other reasons, try cache or just assume we need to update/create
      userSnap = await getDoc(userRef);
    }
    
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: 'user',
        createdAt: Timestamp.now(),
        lastLogin: Timestamp.now()
      });
    } else {
      await updateDoc(userRef, {
        lastLogin: Timestamp.now(),
        displayName: user.displayName,
        photoURL: user.photoURL
      });
    }
    hasSyncedInSession = true;
  } catch (error: any) {
    const message = error.message || String(error);
    if (message.includes("quota") || message.includes("Quota")) {
      cache.setQuotaCooldown();
    }
    console.warn("User profile sync failed:", error);
  }
}

export async function getTradeHistory(limitCount = 50, forceRefresh = false): Promise<Trade[]> {
  const path = 'trades';
  const cacheKey = `trade_history_${auth.currentUser?.uid}`;
  
  if (!forceRefresh || cache.isQuotaCooldown()) {
    const cached = cache.get(cacheKey) || cache.getFallback(cacheKey);
    if (cached) return cached;
  }

  try {
    const q = query(
      collection(db, path),
      where('userId', '==', auth.currentUser?.uid || 'anonymous'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocsWithAutoFallback(q, cacheKey);
    const result = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Trade));
    cache.set(cacheKey, result, 3600000); // 1 hour TTL
    return result;
  } catch (error) {
    const cached = cache.getFallback(cacheKey);
    if (cached) return cached;
    
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = message.includes("Quota exceeded") || message.includes("Quota limit exceeded") || message.includes("quota");
    
    if (isQuotaError) {
      cache.setQuotaCooldown();
      return [];
    }
    
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
