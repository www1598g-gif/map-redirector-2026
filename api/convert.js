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

    const finalUrl = response.url;
    let lat, lng;

    // 1. 定義精確的提取函數
    const extractFromText = (text) => {
      // 優先找 Google 標準的 !3d 和 !4d
      const googlePattern = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;
      const atPattern = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
      
      let m = text.match(googlePattern) || text.match(atPattern);
      if (m) {
        const tLat = parseFloat(m[1]);
        const tLng = parseFloat(m[2]);
        // 驗證是否在合理的地理範圍內
        if (Math.abs(tLat) <= 90 && Math.abs(tLng) <= 180) {
          return { lat: tLat, lng: tLng };
        }
      }
      return null;
    };

    // 2. 從最終網址提取
    let coords = extractFromText(finalUrl);

    // 3. 如果網址沒座標，下載 HTML 並搜尋 meta 標籤
    if (!coords) {
      const html = await response.text();
      // 在 HTML 中搜尋 og:image 或靜態地圖連結
      coords = extractFromText(html);
    }

    if (coords) {
      // 確保使用精確的 Apple Maps 格式
      const appleMapsUrl = `http://maps.apple.com/?ll=${coords.lat},${coords.lng}&q=${coords.lat},${coords.lng}`;
      res.redirect(302, appleMapsUrl);
    } else {
      res.status(404).send(`無法識別座標。解析後的網址為：${finalUrl}`);
    }
  } catch (err) {
    res.status(500).send('伺服器轉換失敗: ' + err.message);
  }
}