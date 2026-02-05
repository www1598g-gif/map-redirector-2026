export default async function handler(req, res) {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    const finalUrl = response.url;
    const html = await response.text();
    
    // 建立一個檢查並驗證座標的函數
    const findCoords = (text) => {
      // 匹配模式：!3d(緯度)!4d(經度) 或 @(緯度),(經度) 或 center=(緯度)%2C(經度)
      const patterns = [
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,
        /center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/,
        /\[\[(-?\d+\.\d+),(-?\d+\.\d+)\]/ // 匹配 Google 內部 JSON 狀態
      ];

      for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) {
          const lat = parseFloat(m[1]);
          const lng = parseFloat(m[2]);
          if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat !== 0) {
            return { lat, lng };
          }
        }
      }
      return null;
    };

    // 1. 先從最終網址找
    let coords = findCoords(finalUrl);

    // 2. 如果網址沒找到，從 HTML 內容找 (包含 meta 標籤與腳本)
    if (!coords) {
      coords = findCoords(html);
    }

    if (coords) {
      // 構建精確的 Apple Maps 網址
      const appleMapsUrl = `https://maps.apple.com/?ll=${coords.lat},${coords.lng}&q=${coords.lat},${coords.lng}`;
      res.redirect(302, appleMapsUrl);
    } else {
      res.status(404).send(`無法提取座標。解析後的網址：${finalUrl}。請確認 Google 連結是否包含具體地點。`);
    }
  } catch (err) {
    res.status(500).send('API 轉換出錯: ' + err.message);
  }
}