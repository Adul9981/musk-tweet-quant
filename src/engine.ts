import type {
  TimeParams,
  BaseParams,
  VelocitySnapshot,
  OrderBookEntry,
  Portfolio,
  AnalysisResult,
  IntervalAnalysis,
  StrategyOutput,
  VelocityWeights,
  ReverseEngineeringEntry,
} from './types';

const erf = (x: number): number => {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
};

const normalCDF = (x: number, mean: number, stdDev: number): number => {
  if (stdDev === 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (stdDev * Math.sqrt(2))));
};

const calculateDynamicSigma = (remainingHours: number, totalDuration: number): number => {
  const remainingRatio = remainingHours / totalDuration;
  const baseSigma = 50;
  const minSigma = 8;
  return minSigma + (baseSigma - minSigma) * Math.pow(remainingRatio, 0.5);
};

const calculateIntervalProbability = (
  lower: number,
  upper: number,
  mean: number,
  stdDev: number
): number => {
  const pLower = normalCDF(lower, mean, stdDev);
  const pUpper = normalCDF(upper, mean, stdDev);
  return Math.max(0, pUpper - pLower);
};

const calculateReverseVelocity = (
  currentCount: number,
  targetLower: number,
  targetUpper: number,
  remainingHours: number
): { minVelocity: number; maxVelocity: number } => {
  const tweetsNeededLower = targetLower - currentCount;
  const tweetsNeededUpper = targetUpper - currentCount;
  return {
    minVelocity: remainingHours > 0 ? Math.max(0, tweetsNeededLower / remainingHours) : 0,
    maxVelocity: remainingHours > 0 ? Math.max(0, tweetsNeededUpper / remainingHours) : Infinity,
  };
};

const calculateVelocityWeights = (remainingHours: number, totalDuration: number): VelocityWeights => {
  let rawGlobalWeight = remainingHours / totalDuration;
  rawGlobalWeight = Math.max(0.20, Math.min(0.85, rawGlobalWeight));
  const globalWeight = rawGlobalWeight;
  const microWeight = 1 - globalWeight;
  return { globalWeight, microWeight };
};

const calculateReverseEngineering = (
  currentCount: number,
  remainingHours: number,
  intervals: IntervalAnalysis[]
): ReverseEngineeringEntry[] => {
  return intervals.map((interval) => {
    const tweetsNeededMin = interval.lowerBound - currentCount;
    const tweetsNeededMax = interval.upperBound - currentCount;

    let status: 'busted' | 'active' | 'passed' = 'active';
    if (currentCount > interval.upperBound) {
      status = 'busted';
    } else if (currentCount > interval.lowerBound) {
      status = 'passed';
    }

    const minVelocity = remainingHours > 0 ? Math.max(0, tweetsNeededMin) / remainingHours : 0;
    const maxVelocity = remainingHours > 0 ? Math.max(0, tweetsNeededMax) / remainingHours : Infinity;

    return {
      id: interval.id,
      lowerBound: interval.lowerBound,
      upperBound: interval.upperBound,
      tweetsNeededMin: Math.max(0, tweetsNeededMin),
      tweetsNeededMax: Math.max(0, tweetsNeededMax),
      minVelocity,
      maxVelocity,
      status,
    };
  });
};

const determineSignal = (alpha: number, remainingHours: number): 'buy' | 'sell' | 'hold' => {
  if (remainingHours <= 24) return 'hold';
  if (alpha < 0.8) return 'sell';
  if (alpha > 1.05) return 'buy';
  return 'hold';
};

const determinePhase = (remainingHours: number): 'early' | 'mid' | 'late' | 'endgame' => {
  if (remainingHours <= 24) return 'endgame';
  if (remainingHours <= 48) return 'late';
  if (remainingHours <= 96) return 'mid';
  return 'early';
};

const normalizeYesPrice = (price: number): number => {
  if (price > 1) {
    return price / 100;
  }
  return price;
};

export const analyzePredictionMarket = (
  timeParams: TimeParams,
  baseParams: BaseParams,
  velocitySnapshot: VelocitySnapshot,
  orderBook: OrderBookEntry[],
  portfolio: Portfolio
): AnalysisResult => {
  const remainingHoursDecimal =
    timeParams.remainingDays * 24 + timeParams.remainingHours + timeParams.remainingMinutes / 60;
  const remainingHours = Math.max(0, remainingHoursDecimal);
  const elapsedHours = timeParams.totalDuration - remainingHours;

  const globalVelocity =
    elapsedHours > 0 ? baseParams.currentTweetCount / elapsedHours : 0;

  const tweetsDifference = baseParams.currentTweetCount - velocitySnapshot.snapshotCount;
  const microVelocity =
    velocitySnapshot.hoursSinceSnapshot > 0 && tweetsDifference > 0
      ? tweetsDifference / velocitySnapshot.hoursSinceSnapshot
      : 0;

  const velocityWeights = calculateVelocityWeights(remainingHours, timeParams.totalDuration);

  const compositeVelocity =
    (globalVelocity * velocityWeights.globalWeight) + (microVelocity * velocityWeights.microWeight);

  const expectedCenter = baseParams.currentTweetCount + compositeVelocity * remainingHours;

  const currentSigma = calculateDynamicSigma(remainingHours, timeParams.totalDuration);

  const intervals: IntervalAnalysis[] = orderBook.map((entry) => {
    const normalizedPrice = normalizeYesPrice(entry.yesPrice);
    const trueProb = calculateIntervalProbability(
      entry.lowerBound,
      entry.upperBound,
      expectedCenter,
      currentSigma
    );
    const alpha = normalizedPrice > 0 ? trueProb / normalizedPrice : 0;
    const velocityRange = calculateReverseVelocity(
      baseParams.currentTweetCount,
      entry.lowerBound,
      entry.upperBound,
      remainingHours
    );
    const existingPosition = portfolio.positions.find((p) => p.id === entry.id);
    const signal = determineSignal(alpha, remainingHours);

    return {
      id: entry.id,
      lowerBound: entry.lowerBound,
      upperBound: entry.upperBound,
      marketPrice: normalizedPrice,
      trueProbability: trueProb,
      alpha,
      signal,
      minVelocity: velocityRange.minVelocity,
      maxVelocity: velocityRange.maxVelocity,
      position: existingPosition?.shares || 0,
    };
  });

  const reverseEngineering = calculateReverseEngineering(
    baseParams.currentTweetCount,
    remainingHours,
    intervals
  );

  const strategy = generateStrategy(intervals, portfolio, remainingHours);

  return {
    globalVelocity,
    microVelocity,
    compositeVelocity,
    expectedCenter,
    currentSigma,
    intervals,
    strategy,
    remainingHoursDecimal,
    elapsedHours,
    velocityWeights,
    reverseEngineering,
  };
};

const generateStrategy = (
  intervals: IntervalAnalysis[],
  _portfolio: Portfolio,
  remainingHours: number
): StrategyOutput => {
  const phase = determinePhase(remainingHours);
  const orders: string[] = [];
  const alerts: string[] = [];
  const recommendations: string[] = [];

  intervals.forEach((interval) => {
    if (interval.alpha < 0.8 && interval.position > 0) {
      alerts.push(
        `🚨 警报：[${interval.lowerBound}-${interval.upperBound}] Alpha 跌至 ${interval.alpha.toFixed(2)}，立刻清仓套现！`
      );
      orders.push(`市价清仓 [${interval.lowerBound}-${interval.upperBound}] ${interval.position} 份`);
    }
    if (interval.alpha > 1.05 && interval.position === 0 && remainingHours > 24) {
      alerts.push(`✅ 机会：[${interval.lowerBound}-${interval.upperBound}] Alpha ${interval.alpha.toFixed(2)}，低估金矿！`);
    }
  });

  const sortedByAlpha = [...intervals].sort((a, b) => b.alpha - a.alpha);
  const highAlphaIntervals = sortedByAlpha.filter((i) => i.alpha > 1.05);
  const lowAlphaIntervals = sortedByAlpha.filter((i) => i.alpha < 0.8 && i.position > 0);

  if (phase === 'early' && remainingHours > 48) {
    recommendations.push(`前期宽幅网格防御：关注 ${Math.min(3, highAlphaIntervals.length)} 个高 Alpha 区间`);
  } else if (phase === 'mid' || phase === 'late') {
    recommendations.push(`收缩火力到 2-3 个核心红心区间`);
    if (lowAlphaIntervals.length > 0) {
      recommendations.push(`砍掉边缘烂尾楼：${lowAlphaIntervals.map((i) => `[${i.lowerBound}-${i.upperBound}]`).join(', ')}`);
    }
  }

  if (phase === 'endgame') {
    recommendations.push('🔴 最后24小时：关闭所有买入/建仓建议');
    recommendations.push('🔴 转为寻找盘口阶段性高价（如 60-80 美分）强制止盈');
    recommendations.push('🔴 规避最后几个小时绝杀爆仓风险');
    
    const highPriceIntervals = intervals.filter((i) => i.marketPrice >= 0.6);
    highPriceIntervals.forEach((i) => {
      if (i.position > 0) {
        alerts.push(`💰 止盈警报：[${i.lowerBound}-${i.upperBound}] 价格 ${(i.marketPrice * 100).toFixed(0)}%，建议分批止盈！`);
      }
    });
  }

  return {
    phase,
    orders,
    alerts,
    recommendations,
  };
};

export const formatVelocity = (velocity: number): string => {
  if (velocity === Infinity || isNaN(velocity)) return '∞';
  return velocity.toFixed(3);
};

export const formatPercent = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`;
};

export const formatMarketPrice = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`;
};

export const formatWeight = (weight: number): string => {
  return `${(weight * 100).toFixed(0)}%`;
};

export const generateTweetContent = (
  analysis: AnalysisResult,
  marketTitle: string,
  currentTweetCount: number
): string => {
  const topAlpha = [...analysis.intervals]
    .filter((i) => i.alpha > 1)
    .sort((a, b) => b.alpha - a.alpha)[0];

  const remainingText =
    analysis.remainingHoursDecimal >= 24
      ? `${(analysis.remainingHoursDecimal / 24).toFixed(1)}天`
      : `${analysis.remainingHoursDecimal.toFixed(1)}小时`;

  let tweet = `📊 ${marketTitle} 实时追踪\n\n`;
  tweet += `🎯 当前推文数: ${currentTweetCount}\n`;
  tweet += `⚡ 综合时速: ${formatVelocity(analysis.compositeVelocity)} 条/小时\n`;
  tweet += `⏰ 剩余时间: ${remainingText}\n\n`;

  if (topAlpha) {
    tweet += `🟢 低估区间 [${topAlpha.lowerBound}-${topAlpha.upperBound}] Alpha: ${topAlpha.alpha.toFixed(2)}\n`;
    tweet += `📈 真实概率: ${formatPercent(topAlpha.trueProbability)} | 市场价格: ${formatMarketPrice(topAlpha.marketPrice)}\n`;
  }

  tweet += `\n#预测市场 #量化分析`;

  return tweet;
};
