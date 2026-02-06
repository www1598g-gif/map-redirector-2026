module.exports = async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15' }
    });

    const finalUrl = response.url;
    const html = await response.text();
    const urlObj = new URL(finalUrl);
    
    let lat, lng;

    // --- 1. 優先權 A：從 HTML Body 直讀數位座標 (最精準) ---
    // 這是針對你提供的馬武督、泰國原始碼設計的「數位快取」讀取法
    const htmlLat = html.match(/!3d([-0-9.]+)/);
    const htmlLng = html.match(/!2d([-0-9.]+)/);
    
    if (htmlLat && htmlLng) {
      lat = htmlLat[1];
      lng = htmlLng[1];
    } else {
      // --- 2. 優先權 B：網址列座標掃描 (備援路徑) ---
      const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordMatch) {
        lat = coordMatch[1];
        lng = coordMatch[2];
      }
    }

    // --- 3. 獲取地點名稱訊號 ---
    let searchQuery;
    const poiMatch = html.match(/"0x[0-9a-f]+:0x[0-9a-f]+","((?:[^"\\]|\\.)*?)"/);
    if (poiMatch && poiMatch[1]) {
      searchQuery = poiMatch[1].replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (m, c) => 
        String.fromCharCode(parseInt(c, 16))
      );
    } else {
      searchQuery = urlObj.searchParams.get('q') || "位置";
    }

    // --- 4. 【去噪濾波】移除店名中的地址雜訊 ---
    if (searchQuery) {
      // 移除結尾的 " - Google 地圖"
      searchQuery = searchQuery.replace(/\s*[-–—]\s*Google.*/i, '');
      // 移除開頭或結尾的純數字 (例如 306, 86 等門牌/郵遞區號)
      searchQuery = searchQuery.replace(/^\d{3,5}\s*/, '').replace(/\s*\d{3,5}$/, '').trim();
    }

    // --- 5. 輸出跳轉 ---
    if (lat && lng) {
      // 有精確座標時，強行插針 (ll) 並帶上店名標籤 (q)
      const appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery)}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      // 萬一完全斷訊，退回到純名稱搜尋
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send("訊號解析失敗");
  } catch (err) {
    res.status(500).send('API 執行異常: ' + err.message);
  }
};