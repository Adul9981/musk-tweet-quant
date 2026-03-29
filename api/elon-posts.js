export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(
      'https://xtracker.polymarket.com/api/users/elonmusk/posts?limit=5',
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
      return res.status(404).json({ error: 'No posts found' });
    }

    const posts = data.data.map(post => ({
      id: post.id,
      content: post.content || post.text || '',
      createdAt: post.createdAt,
      url: post.url || post.permalink || '',
      metrics: post.metrics || {},
    }));

    return res.status(200).json({
      success: true,
      posts,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('XTracker posts API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
