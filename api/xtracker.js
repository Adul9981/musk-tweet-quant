export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const REFERRAL_CODE = '?via=serene77mc-g6kj';

  try {
    const response = await fetch(
      'https://xtracker.polymarket.com/api/users/elonmusk/trackings?activeOnly=true',
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from XTracker' });
    }

    const data = await response.json();

    if (!data.success || !data.data) {
      return res.status(404).json({ error: 'No trackings found' });
    }

    const sevenDayTrackings = data.data.filter(tracking => {
      const start = new Date(tracking.startDate);
      const end = new Date(tracking.endDate);
      const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
      return daysDiff >= 6 && daysDiff <= 8;
    });

    const trackings = sevenDayTrackings.map(tracking => ({
      id: tracking.id,
      title: tracking.title,
      startDate: tracking.startDate,
      endDate: tracking.endDate,
      marketLink: tracking.marketLink + (tracking.marketLink.includes('?') ? '&' : REFERRAL_CODE),
      slug: tracking.marketLink?.split('/').pop()?.split('?')[0] || '',
    }));

    const detailedTrackings = await Promise.all(
      trackings.map(async (tracking) => {
        try {
          const statsResponse = await fetch(
            `https://xtracker.polymarket.com/api/trackings/${tracking.id}?includeStats=true`
          );
                if (statsResponse.ok) {
                  const statsData = await statsResponse.json();
                  if (statsData.success && statsData.data.stats) {
                    const rawDaily = statsData.data.stats.daily || [];
                    const now = new Date();
                    const endDate = new Date(tracking.endDate);
                    const diffMs = endDate.getTime() - now.getTime();
                    const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const hoursRemaining = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                    // 按北京时间日期聚合（xtracker 原始数据可能每小时一条）
                    const dailyMap = new Map();
                    for (const d of rawDaily) {
                      const bjDate = new Date(new Date(d.date).getTime() + 8 * 60 * 60 * 1000)
                        .toISOString().split('T')[0];
                      dailyMap.set(bjDate, (dailyMap.get(bjDate) || 0) + (d.count || 0));
                    }
                    const daily = Array.from(dailyMap.entries())
                      .map(([date, count]) => ({ date, count }))
                      .sort((a, b) => a.date.localeCompare(b.date));

                    const todayBeijing = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
                    const todayTotal = dailyMap.get(todayBeijing) || 0;

                    const elapsed = statsData.data.stats.daysElapsed;
                    const actualPace = elapsed > 0 ? Math.round(statsData.data.stats.total / elapsed) : 0;

                    return {
                      ...tracking,
                      stats: {
                        total: statsData.data.stats.total,
                        pace: actualPace,
                        percentComplete: statsData.data.stats.percentComplete,
                        daysElapsed: statsData.data.stats.daysElapsed,
                        daysRemaining: daysRemaining,
                        hoursRemaining: hoursRemaining,
                        daysTotal: statsData.data.stats.daysTotal,
                        daily,
                        todayTotal,
                      },
                    };
                  }
                }
        } catch (e) {
          console.error(`Failed to fetch stats for ${tracking.id}:`, e);
        }
        return {
          ...tracking,
          stats: null,
        };
      })
    );

    return res.status(200).json({
      success: true,
      trackings: detailedTrackings,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('XTracker API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
