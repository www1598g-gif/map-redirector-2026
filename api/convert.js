module.exports = async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    // 1. 執行重定向追蹤
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'zh-TW,zh;q=0.9'
      }
    });

    const finalUrl = response.url;
    const urlObj = new URL(finalUrl);
    
    // 2. 提取地址或店名
    // 優先找 q 參數，如果沒有，則從 URL 路徑中提取店名 (例如 /place/店名/)
    let searchQuery = urlObj.searchParams.get('q');
    
    if (!searchQuery) {
      const placeMatch = finalUrl.match(/\/place\/([^\/]+)/);
      if (placeMatch) {
        searchQuery = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      }
    }

    if (searchQuery) {
      // 3. 丟給 Apple Maps 進行搜尋
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`;
      return res.redirect(302, appleMapsUrl);
    }

    res.status(404).send(`無法從網址提取地址。最終網址為：${finalUrl}`);
  } catch (err) {
    res.status(500).send('API 執行失敗: ' + err.message);
  }
};