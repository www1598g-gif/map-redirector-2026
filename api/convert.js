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
    const html = await response.text();

    const findGlobalCoords = (text) => {
      // 全球通用的四種座標特徵模式：
      // 1. !3d...!4d (Google 最準確的內部標註)
      // 2. @lat,lng (網址列常用)
      // 3. center=... 或 ll=... (預覽圖常用)
      // 4. [lat, lng] (JSON 狀態資料)
      const patterns = [
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,
        /[?&](?:center|ll|q)=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/,
        /\[\[(-?\d+\.\d+),(-?\d+\.\d+)\]/
      ];

      for (const pattern of patterns) {
        const matches = [...text.matchAll(new RegExp(pattern, 'g'))];
        for (const m of matches) {
          const lat = parseFloat(m[1]);
          const lng = parseFloat(m[2]);

          // 全球標準驗證邏輯：
          // 緯度絕對值 <= 90 且 經度絕對值 <= 180
          // 且緯度絕對值需大於 0.01 (排除地圖初始 0,0 點的雜訊)
          if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Math.abs(lat) > 0.01) {
            return { lat, lng };
          }
        }
      }
      return null;
    };

    // 優先搜尋長網址，其次搜尋 HTML 內容
    let coords = findGlobalCoords(finalUrl) || findGlobalCoords(html);

    if (coords) {
      // 使用 https 協議並帶上 q (標記點) 與 ll (視窗中心) 確保精準度
      const appleMapsUrl = `https://maps.apple.com/?q=${coords.lat},${coords.lng}&ll=${coords.lat},${coords.lng}`;
      res.redirect(302, appleMapsUrl);
    } else {
      res.status(404).send(`無法識別座標。最終網址：${finalUrl}`);
    }
  } catch (err) {
    res.status(500).send('API 發生錯誤: ' + err.message);
  }
}