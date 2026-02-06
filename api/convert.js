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
    const html = await response.text(); // 取得網頁原始碼以進行掃描
    const urlObj = new URL(finalUrl);
    
    // 1. 抓座標 (增加 HTML 備援邏輯)
    let lat, lng;
    const urlCoordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    
    if (urlCoordMatch) {
      // 優先從網址抓取
      lat = urlCoordMatch[1];
      lng = urlCoordMatch[2];
    } else {
      // 網址沒座標時，暴力掃描 HTML 內的 JSON 數據陣列
      // 這是 Google Maps 初始狀態常用的座標封裝格式
      const htmlCoordMatch = html.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
      if (htmlCoordMatch) {
        lat = htmlCoordMatch[1];
        lng = htmlCoordMatch[2];
      }
    }
    
    // 2. 抓店名 (維持你的主邏輯)
    let searchQuery = urlObj.searchParams.get('q');
    if (!searchQuery) {
      const nameMatch = finalUrl.match(/\/(?:place|search)\/([^\/\?]+)/);
      if (nameMatch) {
        searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      }
    }

    // 3. 組合 Apple Maps 連結 (綜合店名與座標)
    let appleMapsUrl;
    if (lat && lng) {
      // 綜合模式：ll 負責插針位置，q 負責顯示店名標籤
      // 這樣就算 Apple Maps 圖資找不到店名，插針也會在 Google 給的精確座標上
      appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery || '位置')}`;
    } else if (searchQuery) {
      // 只有店名時的搜尋模式
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