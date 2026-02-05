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
    const html = await response.text();
    // 掃描來源：最終網址 + 前 100KB HTML (包含 meta, scripts)
    const scanTarget = finalUrl + " " + html.substring(0, 100000);

    const patterns = [
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,           // Google 標準格式
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,               // 網址列格式
      /[?&](?:center|ll|q)=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/, // 靜態地圖參數
      /\[\[(-?\d+\.\d+),(-?\d+\.\d+)\]/,          // JS 內部狀態
      /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/           // 廣義座標對
    ];

    let lat, lng;

    for (const pattern of patterns) {
      const matches = [...scanTarget.matchAll(new RegExp(pattern, 'g'))];
      for (const m of matches) {
        const tLat = parseFloat(m[1]);
        const tLng = parseFloat(m[2]);

        // 核心過濾邏輯：必須符合地理常規 (±90, ±180)
        // 且排除掉整數 ID (座標通常有 4 位以上小數)
        if (Math.abs(tLat) <= 90 && Math.abs(tLng) <= 180 && !Number.isInteger(tLat)) {
          // 排除掉 0,0 附近的無意義雜訊
          if (Math.abs(tLat) > 0.001) {
            lat = tLat;
            lng = tLng;
            break;
          }
        }
      }
      if (lat) break;
    }

    if (lat && lng) {
      // 強制在該座標插針 (q=) 並定位畫面 (ll=)
      const appleMapsUrl = `https://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}`;
      return res.redirect(302, appleMapsUrl);
    }

    res.status(404).send(`未能辨識座標。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('API 執行錯誤: ' + err.message);
  }
};