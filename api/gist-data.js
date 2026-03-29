const GIST_ID = 'd174b4498c408076ff218e164f24807e';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  try {
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MuskTweetPredictionApp'
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch from Gist' });
    }

    const gist = await response.json();
    const content = gist.files['polymarket-data.json']?.content;

    if (!content) {
      return res.status(404).json({ error: 'No data found in Gist' });
    }

    const data = JSON.parse(content);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching from Gist:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
