import axios from 'axios';

const SITE_CONFIGS = {
  msport: {
    name: 'msport',
    urlPattern: /msport/i,
    rowSelector: 'table tr',
    teamCell: 'td:nth-child(1)',
    scoreCell: 'td:nth-child(2)',
    oddsCell: 'td:nth-child(3)',
    trendCell: 'td:nth-child(4)'
  },
  sportybet: {
    name: 'sportybet',
    urlPattern: /sportybet/i,
    rowSelector: '.result-list .result-item, table tr',
    teamCell: '.result-team, td:nth-child(1)',
    scoreCell: '.result-score, td:nth-child(2)',
    oddsCell: '.result-odds, td:nth-child(3)',
    trendCell: '.result-trend, td:nth-child(4)'
  },
  bet9ja: {
    name: 'bet9ja',
    urlPattern: /bet9ja/i,
    rowSelector: '.event-row, table tr',
    teamCell: '.event-team, td:nth-child(1)',
    scoreCell: '.event-score, td:nth-child(2)',
    oddsCell: '.event-odds, td:nth-child(3)',
    trendCell: '.event-trend, td:nth-child(4)'
  },
  betpawa: {
    name: 'betpawa',
    urlPattern: /betpawa/i,
    rowSelector: '.market-row, table tr',
    teamCell: '.team-name, td:nth-child(1)',
    scoreCell: '.score-label, td:nth-child(2)',
    oddsCell: '.odds-value, td:nth-child(3)',
    trendCell: '.trend-label, td:nth-child(4)'
  }
};

function findConfigForUrl(url) {
  const lowerUrl = String(url).toLowerCase();
  return Object.values(SITE_CONFIGS).find((config) => config.urlPattern.test(lowerUrl));
}

export async function scrapeHistoricalGoals(page, targetUrl) {
  const config = findConfigForUrl(targetUrl) || SITE_CONFIGS.msport;
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (error) {
    console.warn(`Unable to navigate to ${targetUrl}: ${error.message}`);
  }

  const records = await page.$$eval(config.rowSelector, (rows, selectors) => {
    const normalize = (value) => (String(value || '').trim());
    return rows.map((row) => {
      const team = row.querySelector(selectors.teamCell)?.textContent || '';
      const score = row.querySelector(selectors.scoreCell)?.textContent || '';
      const odds = row.querySelector(selectors.oddsCell)?.textContent || '';
      const trend = row.querySelector(selectors.trendCell)?.textContent || '';
      return {
        site: selectors.siteName,
        url: selectors.targetUrl,
        team: normalize(team),
        score: normalize(score),
        odds: normalize(odds),
        trend: normalize(trend),
        date: new Date().toISOString(),
        season: new Date().getFullYear().toString()
      };
    });
  }, { ...config, siteName: config.name, targetUrl });

  return records.filter((record) => record.score && record.team);
}

export async function extractHistoricalApiEndpoints(page, targetUrl) {
  const config = findConfigForUrl(targetUrl) || SITE_CONFIGS.msport;
  const apiCandidates = [];
  const pageData = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((script) => script.src);
    const endpoints = [];
    if (window.__INITIAL_STATE__) {
      endpoints.push(JSON.stringify(window.__INITIAL_STATE__));
    }
    return { scripts, endpoints };
  });

  for (const scriptUrl of pageData.scripts || []) {
    if (!scriptUrl) continue;
    if (!scriptUrl.startsWith('http')) continue;
    try {
      const response = await axios.get(scriptUrl, { timeout: 20000 });
      const text = response.data;
        const matches = Array.from(text.matchAll(/(https?:\/\/[^\s"']*api[^\s"']*)/gi)).map((m) => m[1]);
      for (const url of matches) {
        if (!apiCandidates.includes(url)) apiCandidates.push(url);
      }
    } catch (error) {
      continue;
    }
  }

  return { site: config.name, targetUrl, apiCandidates, discovered: pageData.endpoints || [] };
}

export async function querySiteApi(url, endpoint) {
  try {
    const response = await axios.get(endpoint, { timeout: 25000 });
    return { endpoint, status: response.status, data: response.data };
  } catch (error) {
    return { endpoint, status: error.response?.status || null, error: error.message };
  }
}

export default {
  scrapeHistoricalGoals,
  extractHistoricalApiEndpoints,
  querySiteApi,
  SITE_CONFIGS
};
