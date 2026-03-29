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
      slug: tracking.marketLink?.split('/').pop() || '',
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
              const daily = statsData.data.stats.daily || [];
              const today = new Date().toISOString().split('T')[0];
              const todayData = daily.filter(d => d.date.startsWith(today));
              const todayTotal = todayData.reduce((sum, d) => sum + d.count, 0);
              
              return {
                ...tracking,
                stats: {
                  total: statsData.data.stats.total,
                  pace: statsData.data.stats.pace,
                  percentComplete: statsData.data.stats.percentComplete,
                  daysElapsed: statsData.data.stats.daysElapsed,
                  daysRemaining: statsData.data.stats.daysRemaining,
                  daysTotal: statsData.data.stats.daysTotal,
                  daily: daily,
                  todayTotal: todayTotal,
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
