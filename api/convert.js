export default async function handler(req, res) {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });

    // 1. 優先檢查最終網址 (URL String) 是否包含座標
    const finalUrl = response.url;
    const urlRegex = /(-?\d+\.\d+)[,!][34]?d?(-?\d+\.\d+)/;
    let match = finalUrl.match(urlRegex);

    // 2. 如果網址沒座標，則讀取網頁源碼 (HTML Body) 搜尋
    if (!match) {
      const html = await response.text();
      // 搜尋 HTML 中的 meta tags (og:image)、staticmap 連結或座標特徵
      // 支援格式包含：ll=lat,lng / center=lat,lng / !3dlat!4dlng
      const bodyRegex = /(-?\d+\.\d+)(?:,|%2C|!3d|!4d|ll=|center=)(-?\d+\.\d+)/;
      match = html.match(bodyRegex);
    }

    if (match) {
      const lat = match[1];
      const lng = match[2];
      
      // 3. 輸出 Apple Maps 協議網址
      const appleMapsUrl = `http://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`;
      res.redirect(302, appleMapsUrl);
    } else {
      res.status(404).send(`無法提取座標。解析後的最終網址為: ${finalUrl}。請確認該地點在 Google Maps 上是否有精確位置。`);
    }
  } catch (err) {
    res.status(500).send('伺服器轉換失敗: ' + err.message);
  }
}