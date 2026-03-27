export default async function handler(req, res) {
  return res.status(200).json({ 
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    user: 'elon',
    tweetCount: 42
  });
}
