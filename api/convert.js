export default async function handler(req, res) {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const finalUrl = response.url;
    const html = await response.text();

    const findPreciseCoords = (text) => {
      // 1. 優先尋找 Google 靜態地圖中的 center 或 ll 參數 (這是最準確的地點中心)
      // 2. 尋找 Google 標準的 !3d (緯度) !4d (經度) 標籤
      const patterns = [
        /(?:center|ll|q)=|%2C|=)(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/,
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
        /@(-?\d+\.\d+),(-?\d+\.\d+)/
      ];

      for (const pattern of patterns) {
        const matches = [...text.matchAll(new RegExp(pattern, 'g'))];
        for (const m of matches) {
          const lat = parseFloat(m[1]);
          const lng = parseFloat(m[2]);

          // 全球地理邊界檢查：緯度 ±90, 經度 ±180
          // 增加精確度檢查：經緯度通常會有 4 位以上的小數點
          if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Math.abs(lat) > 0.1) {
            return { lat, lng };
          }
        }
      }
      return null;
    };

    // 依序掃描：優先從 HTML (含 meta 標籤) 找，再從跳轉後的 URL 找
    let coords = findPreciseCoords(html) || findPreciseCoords(finalUrl);

    if (coords) {
      // 構建 Apple Maps 連結：q 用於插針顯示名稱，ll 用於地圖中心
      const appleMapsUrl = `https://maps.apple.com/?q=${coords.lat},${coords.lng}&ll=${coords.lat},${coords.lng}`;
      res.redirect(302, appleMapsUrl);
    } else {
      res.status(404).send(`無法識別座標。最終網址：${finalUrl}`);
    }
  } catch (err) {
    res.status(500).send('API 錯誤: ' + err.message);
  }
}