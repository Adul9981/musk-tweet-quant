export interface TimeParams {
  totalDuration: number;
  marketTitle: string;
  currentTimestamp: number;
  remainingDays: number;
  remainingHours: number;
  remainingMinutes: number;
}

export interface BaseParams {
  currentTweetCount: number;
}

export interface VelocitySnapshot {
  snapshotCount: number;
  hoursSinceSnapshot: number;
}

export interface OrderBookEntry {
  id: string;
  lowerBound: number;
  upperBound: number;
  yesPrice: number;
}

export interface PortfolioEntry {
  id: string;
  lowerBound: number;
  upperBound: number;
  shares: number;
}

export interface Portfolio {
  cashBalance: number;
  positions: PortfolioEntry[];
}

export interface IntervalAnalysis {
  id: string;
  lowerBound: number;
  upperBound: number;
  marketPrice: number;
  trueProbability: number;
  alpha: number;
  signal: 'buy' | 'sell' | 'hold';
  minVelocity: number;
  maxVelocity: number;
  position: number;
}

export interface VelocityStatus {
  state: 'surge' | 'normal';
  message: string;
}

export interface ReverseEngineeringEntry {
  id: string;
  lowerBound: number;
  upperBound: number;
  tweetsNeededMin: number;
  tweetsNeededMax: number;
  minVelocity: number;
  maxVelocity: number;
  status: 'busted' | 'active' | 'passed';
}

export interface StrategyOutput {
  phase: 'early' | 'mid' | 'late' | 'endgame';
  orders: string[];
  alerts: string[];
  recommendations: string[];
}

export interface AnalysisResult {
  globalVelocity: number;
  microVelocity: number;
  compositeVelocity: number;
  expectedCenter: number;
  currentSigma: number;
  intervals: IntervalAnalysis[];
  strategy: StrategyOutput;
  remainingHoursDecimal: number;
  elapsedHours: number;
  velocityStatus: VelocityStatus;
  reverseEngineering: ReverseEngineeringEntry[];
  elonMultiplier: number;
}
