async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch(e) { return {}; }
  }
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await readBody(req);
  const { imageBase64, mediaType } = body;

  if (!imageBase64) return res.status(400).json({ error: 'Missing image data' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const prompt = `你是一位專業的皮膚科美容顧問。請仔細觀察這張臉部照片，進行肌膚類型診斷。

請以 JSON 格式回覆（不要加任何 markdown 符號），格式如下：
{
  "skinType": "混合肌",
  "subType": "T區偏油・兩頰偏乾",
  "scores": { "oilBalance": 72, "sensitivity": 45, "hydration": 63 },
  "traits": [
    {"icon": "💧", "name": "缺水", "desc": "皮膚表層水分不足，易出現細紋", "level": 70}
  ],
  "aiNote": "根據照片分析...",
  "products": [
    {"emoji": "🧴", "type": "潔膚", "name": "溫和胺基酸潔面乳"}
  ],
  "courses": [
    {"icon": "🫁", "name": "深層清潔護理課程", "tag": "每月 1-2 次"}
  ],
  "dietGood": [
    {"emoji": "🥑", "name": "酪梨", "desc": "富含健康脂肪，滋潤皮膚屏障"}
  ],
  "dietAvoid": [
    {"emoji": "🍟", "name": "油炸食物", "desc": "加重出油、毛孔堵塞"}
  ]
}

重要：請根據照片中真實觀察到的膚況給出診斷。若照片不清楚或無法判斷，請給出通用的混合肌建議。所有內容必須用繁體中文。`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Upstream API call failed' });
  }
}
