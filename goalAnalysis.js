import fs from 'fs';
import path from 'path';
import { create, all } from 'mathjs';

const math = create(all, {});
const DATA_DIR = process.env.BOT_DATA_DIR || 'bot-data';

function normalizeScoreString(score) {
  const normalized = score?.trim().replace(/×/g, 'x').replace(/:/g, '-').replace(/\s+/g, ' ');
  return normalized;
}

export function parseScore(scoreText) {
  if (!scoreText || typeof scoreText !== 'string') return { home: 0, away: 0, total: 0 };
  const normalized = normalizeScoreString(scoreText);
  const match = normalized.match(/(\d+)\s*[-x:]\s*(\d+)/i);
  if (!match) return { home: 0, away: 0, total: 0 };
  const home = Number(match[1]);
  const away = Number(match[2]);
  return { home, away, total: home + away };
}

export function normalizeHistoricalRecord(record, siteName) {
  const { team = '', score = '', odds = '', trend = '', date, season } = record;
  const parsed = parseScore(score);
  return {
    site: siteName,
    team: team.replace(/\s+/g, ' ').trim(),
    score: normalizeScoreString(score),
    odds: Number(String(odds).replace(/[^0-9.\-]/g, '')) || 0,
    trend: trend || '',
    homeGoals: parsed.home,
    awayGoals: parsed.away,
    totalGoals: parsed.total,
    season: season || (date ? new Date(date).getFullYear().toString() : 'unknown'),
    rawDate: date || new Date().toISOString(),
    scrapedAt: new Date().toISOString()
  };
}

export function buildHistoricalDataset(records) {
  const dataset = records.map((record) => normalizeHistoricalRecord(record, record.site || 'unknown'));
  const bySeason = dataset.reduce((acc, row) => {
    const season = row.season || 'unknown';
    acc[season] = acc[season] || [];
    acc[season].push(row);
    return acc;
  }, {});

  return { dataset, bySeason };
}

export function detectSeasonalTrends(dataset) {
  const seasons = {};
  for (const row of dataset) {
    const season = row.season || 'unknown';
    seasons[season] = seasons[season] || { totals: [], exact: {}, overUnder: { over2_5: 0, under2_5: 0, total: 0 } };
    seasons[season].totals.push(row.totalGoals);
    seasons[season].exact[row.score] = (seasons[season].exact[row.score] || 0) + 1;
    seasons[season].overUnder.total += 1;
    if (row.totalGoals > 2.5) seasons[season].overUnder.over2_5 += 1;
    else seasons[season].overUnder.under2_5 += 1;
  }

  return Object.entries(seasons).reduce((acc, [season, data]) => {
    const mean = data.totals.length ? math.mean(data.totals) : 0;
    const modeScore = Object.entries(data.exact).sort((a, b) => b[1] - a[1])[0];
    acc[season] = {
      count: data.totals.length,
      averageTotalGoals: mean,
      frequentScore: modeScore ? { score: modeScore[0], count: modeScore[1] } : null,
      over2_5Rate: data.overUnder.total ? data.overUnder.over2_5 / data.overUnder.total : 0,
      under2_5Rate: data.overUnder.total ? data.overUnder.under2_5 / data.overUnder.total : 0,
      exactScoreDistribution: data.exact
    };
    return acc;
  }, {});
}

export function detectPredictivePatterns(dataset) {
  const scoreCounts = {};
  const totalCounts = {};
  const teamTotalCounts = {};
  const datePatterns = {};

  for (const row of dataset) {
    scoreCounts[row.score] = (scoreCounts[row.score] || 0) + 1;
    totalCounts[row.totalGoals] = (totalCounts[row.totalGoals] || 0) + 1;
    if (row.team) {
      teamTotalCounts[row.team] = teamTotalCounts[row.team] || {};
      teamTotalCounts[row.team][row.totalGoals] = (teamTotalCounts[row.team][row.totalGoals] || 0) + 1;
    }
    const dayKey = row.rawDate ? new Date(row.rawDate).toISOString().slice(0, 10) : 'unknown';
    datePatterns[dayKey] = (datePatterns[dayKey] || 0) + 1;
  }

  const topScores = Object.entries(scoreCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([score, count]) => ({ score, count }));
  const topTotals = Object.entries(totalCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([total, count]) => ({ total: Number(total), count }));
  const repeatingDays = Object.entries(datePatterns).filter(([, count]) => count > 3).map(([date, count]) => ({ date, count }));

  return {
    topExactScores: topScores,
    topTotalGoals: topTotals,
    teamTotalProfiles: teamTotalCounts,
    repeatingDatePatterns: repeatingDays,
    matchCount: dataset.length,
    totalGoalEntropy: dataset.length ? math.entropy(Object.values(totalCounts).map(Number)) : 0
  };
}

export function detectManipulation(dataset) {
  const exactCounts = dataset.reduce((acc, row) => {
    acc[row.score] = (acc[row.score] || 0) + 1;
    return acc;
  }, {});
  const totalCounts = dataset.reduce((acc, row) => {
    acc[row.totalGoals] = (acc[row.totalGoals] || 0) + 1;
    return acc;
  }, {});
  const repeatedExactRate = dataset.length ? Object.values(exactCounts).filter((count) => count > 2).length / Object.keys(exactCounts).length : 0;
  const topExact = Object.entries(exactCounts).map(([score, count]) => ({ score, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  return {
    repeatedExactRate,
    topExactScoreRepeats: topExact,
    likelyManipulation: repeatedExactRate > 0.3,
    notes: repeatedExactRate > 0.3 ? 'High exact score repetition suggests a non-random pattern or manipulation.' : 'No obvious repeated exact score manipulation detected.'
  };
}

import crypto from 'crypto';

export function buildSeedDataset(dataset, options = {}) {
  const topTotals = detectPredictivePatterns(dataset).topTotalGoals.slice(0, 5);
  const topScores = detectPredictivePatterns(dataset).topExactScores.slice(0, 5);
  return {
    seedSource: options.seedSource || 'historical-goals-dataset',
    featureCounts: {
      totalGoals: topTotals,
      exactScores: topScores
    },
    datasetSize: dataset.length,
    firstRecord: dataset[0] || null,
    lastRecord: dataset[dataset.length - 1] || null
  };
}

function createSeedFromData(seedData) {
  const serialized = JSON.stringify(seedData);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function createSeededRng(seed) {
  let state = parseInt(seed.slice(0, 16), 16) || 1;
  return function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return Math.abs(state) / 0xFFFFFFFF;
  };
}

export function generatePseudoRandomPredictions(dataset, options = {}) {
  const seedData = buildSeedDataset(dataset, { seedSource: options.seedSource });
  const seed = createSeedFromData(seedData);
  const rng = createSeededRng(seed);
  const patterns = detectPredictivePatterns(dataset);
  const predictions = [];
  const topTotals = patterns.topTotalGoals.length ? patterns.topTotalGoals : [{ total: 2, count: 1 }, { total: 3, count: 1 }];
  const topScores = patterns.topExactScores.length ? patterns.topExactScores : [{ score: '1-1', count: 1 }, { score: '2-1', count: 1 }];

  for (let i = 0; i < (options.count || 5); i++) {
    const totalIndex = Math.floor(rng() * topTotals.length);
    const scoreIndex = Math.floor(rng() * topScores.length);
    const totalChoice = topTotals[totalIndex];
    const scoreChoice = topScores[scoreIndex];
    predictions.push({
      predictionId: `${i + 1}-${seed.slice(0, 8)}`,
      expectedScore: scoreChoice.score,
      expectedTotalGoals: totalChoice.total,
      patternWeight: (scoreChoice.count + totalChoice.count) / 2,
      rngValue: rng(),
      seedPreview: seed.slice(0, 8)
    });
  }

  return { seedData, seed, predictions, source: 'pseudo-random-generator' };
}

export function saveHistoricalDataset(data, fileName = 'historical-goals.json') {
  const outputPath = path.join(process.cwd(), DATA_DIR, fileName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  return outputPath;
}

export default {
  parseScore,
  normalizeHistoricalRecord,
  buildHistoricalDataset,
  detectSeasonalTrends,
  detectPredictivePatterns,
  detectManipulation,
  buildSeedDataset,
  generatePseudoRandomPredictions,
  saveHistoricalDataset
};
