module.exports = async (req, res) => {
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
    const html = await response.text(); // 為了處理 90% 網址沒座標的情況，必須讀取網頁內容
    const urlObj = new URL(finalUrl);
    
    // 1. 抓店名 (維持你的主邏輯，優先從 URL 提取)
    let searchQuery = urlObj.searchParams.get('q');
    if (!searchQuery) {
      const nameMatch = finalUrl.match(/\/(?:place|search)\/([^\/\?]+)/);
      if (nameMatch) {
        searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      }
    }

    // 2. 抓座標 (你的主邏輯：先從網址找)
    let lat, lng;
    const urlCoordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    
    if (urlCoordMatch) {
      lat = urlCoordMatch[1];
      lng = urlCoordMatch[2];
    } else {
      // 3. 備援邏輯：如果網址沒座標（現在 9 成的情況），就從 HTML 裡暴力掃描
      const htmlCoordMatch = html.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
      if (htmlCoordMatch) {
        lat = htmlCoordMatch[1];
        lng = htmlCoordMatch[2];
      }
    }

    // 4. 組合 Apple Maps 連結 (綜合店名與 GPS)
    let appleMapsUrl;
    if (lat && lng) {
      // 綜合模式：ll 定位插針，q 負責顯示店名標籤
      // 這能確保即便 Apple Maps 搜不到店名，也會導航到 Google 指定的那個點
      appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery || '位置')}`;
    } else if (searchQuery) {
      // 沒座標時，退回純店名搜尋模式
      appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`;
    }

    if (appleMapsUrl) {
      return res.redirect(302, appleMapsUrl);
    }

    res.status(404).send(`無法解析座標或店名。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};