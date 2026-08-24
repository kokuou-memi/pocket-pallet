/* =========================================================
   ぽけっと♡ぱれっと — 配信中(LIVE)判定スクリプト
   =========================================================
   ★ここにあなたのYouTube Data API v3キーを入力してください★
   取得先: https://console.cloud.google.com/apis/credentials
   必ず「APIキーの制限」→「アプリケーションの制限」で
   HTTPリファラーを自分のGitHub Pagesドメイン
   (例: https://あなたのユーザー名.github.io/*)に限定してください。
   制限しないと、キーを他人に使われて課金/停止のリスクがあります。
========================================================= */
const YT_API_KEY = "AIzaSyBjleGhcJJxJBZMacpUng0NJzx7vrqn9Ow";

/* 何分キャッシュを使い回すか(ブラウザのlocalStorageに保存)。
   検索APIは1回100クォータ消費し、1日の無料枠は10,000クォータです。
   短くしすぎるとクォータ切れになりやすいので5分を推奨します。 */
const CACHE_MINUTES = 5;
const CACHE_MS = CACHE_MINUTES * 60 * 1000;

/* URLに ?refresh=1 が付いていたら、古いキャッシュを無視して強制的に再チェックする
   (デバッグ用: サイトURLの末尾に ?refresh=1 を付けて開くと使えます) */
const FORCE_REFRESH = new URLSearchParams(location.search).get("refresh") === "1";

/* URLに ?debug=1 が付いている時だけ、エラー時の警告バナーを表示する。
   (自分だけが確認できるようにするためのフラグ。付けなければ誰にも表示されません) */
const DEBUG_MODE = new URLSearchParams(location.search).get("debug") === "1";
if (FORCE_REFRESH) {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("pkpl_live_"))
    .forEach((k) => localStorage.removeItem(k));
  console.info("[pkpl] ?refresh=1 が指定されたため、キャッシュをクリアして再チェックします。");
}

/* 指定チャンネルが今ライブ配信中かどうかを判定する。
   戻り値: { isLive: boolean, error: boolean } */
async function checkIsLive(channelId) {
  const cacheKey = `pkpl_live_${channelId}`;
  const now = Date.now();

  // キャッシュがあり、まだ有効期限内ならAPIを叩かずそれを使う
  try {
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (now - cached.timestamp < CACHE_MS) {
        return { isLive: cached.isLive, error: false };
      }
    }
  } catch (e) {
    // localStorageが使えない環境でも落ちないようにする
  }

  // APIキー未設定の場合は何もしない(コンソールに案内だけ出す)
  if (!YT_API_KEY || YT_API_KEY === "AIzaSyBjleGhcJJxJBZMacpUng0NJzx7vrqn9Ow") {
    console.warn("[pkpl] YouTube APIキーが未設定です。js/main.js の YT_API_KEY を設定してください。");
    return { isLive: false, error: true };
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${YT_API_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const reason = body?.error?.errors?.[0]?.reason || res.status;
      // 起こりやすい原因をコンソールに具体的に出す
      if (reason === "quotaExceeded") {
        console.error(`[pkpl] YouTube APIのクォータ(1日の利用上限)を超過しています。channelId: ${channelId}`);
      } else if (res.status === 403) {
        console.error(`[pkpl] APIアクセスが拒否されました(403)。よくある原因: ①Google Cloud Consoleで「YouTube Data API v3」が有効化されていない ②APIキーのHTTPリファラー制限がこのサイトのURLと一致していない。channelId: ${channelId}`, body);
      } else {
        console.error(`[pkpl] YouTube API エラー (status: ${res.status}, reason: ${reason})。channelId: ${channelId}`, body);
      }
      throw new Error(`YouTube API error: ${res.status}`);
    }

    const data = await res.json();
    const isLive = Array.isArray(data.items) && data.items.length > 0;

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ isLive, timestamp: now }));
    } catch (e) { /* 保存に失敗しても致命的ではないので無視 */ }

    return { isLive, error: false };
  } catch (err) {
    // 失敗時は古いキャッシュがあればそれを使う、なければfalse扱い
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        return { isLive: JSON.parse(cachedRaw).isLive, error: true };
      }
    } catch (e) { /* noop */ }
    return { isLive: false, error: true };
  }
}

/* ページ内の全メンバーカードのLIVE表示を更新する */
async function updateAllLiveStatus() {
  const cards = document.querySelectorAll(".member-card[data-channel-id]");
  const results = await Promise.all(
    Array.from(cards).map(async (card) => {
      const channelId = card.dataset.channelId;
      const result = await checkIsLive(channelId);
      card.classList.toggle("is-live", result.isLive);
      return result.error;
    })
  );

  const noticeEl = document.getElementById("live-status-notice");
  if (noticeEl) {
    const hasError = results.some(Boolean);
    noticeEl.hidden = !(DEBUG_MODE && hasError);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateAllLiveStatus();
  // ページを開いたままの人のためにキャッシュ期間ごとに再チェック
  setInterval(updateAllLiveStatus, CACHE_MS);
});
