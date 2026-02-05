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

    const findCoords = (text) => {
      const patterns = [
        // 1. 標準 Google 格式 (!3d 緯度 !4d 經度)
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
        // 2. 網址列或圖片網址常用 (@緯度,經度 或 center=緯度,經度)
        /[@=](-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/,
        // 3. Google 內部 JS 狀態資料 (常見於 APP_INITIALIZATION_STATE)
        /\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/,
        // 4. 靜態地圖 API 連結特徵
        /staticmap\?center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/
      ];

      for (const pattern of patterns) {
        const matches = [...text.matchAll(new RegExp(pattern, 'g'))];
        for (const m of matches) {
          const lat = parseFloat(m[1]);
          const lng = parseFloat(m[2]);

          // 全球地理邊界驗證：緯度 ±90, 經度 ±180
          if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Math.abs(lat) > 0.0001) {
            return { lat, lng };
          }
        }
      }
      return null;
    };

    // 依序搜尋：最終網址 > HTML 內容 (Meta 標籤與 JS 變數)
    let coords = findCoords(finalUrl) || findCoords(html);

    if (coords) {
      // 構建全球通用的 Apple Maps 連結，q 用於插針定位，ll 用於視角中心
      const appleMapsUrl = `https://maps.apple.com/?q=${coords.lat},${coords.lng}&ll=${coords.lat},${coords.lng}`;
      res.redirect(302, appleMapsUrl);
    } else {
      res.status(404).send(`無法識別座標。最終網址：${finalUrl}。請確認 Google 連結有效且為具體地點。`);
    }
  } catch (err) {
    res.status(500).send('API 處理錯誤: ' + err.message);
  }
}