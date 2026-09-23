/* =========================================================
   ぽけっと♡ぱれっと — 配信中(LIVE)判定スクリプト【APIキー不要版】
   =========================================================
   Google CloudのAPIキーやYouTube Data APIは一切使いません。
   仕組み:
     1. 各メンバーのチャンネルの「ライブ配信固定URL」
        (https://www.youtube.com/embed/live_stream?channel=チャンネルID)
        を、画面の外に隠したiframeとして読み込む
     2. YouTubeの「IFrame Player API」(APIキー不要・無料・無制限)を使って、
        そのiframeが実際に再生できたか(=配信中)、できなかったか(=配信していない)
        を判定する
     3. 判定結果に応じて、メンバーカードに is-live クラスを付け外しする
        (見た目の切り替えは css/style.css 側で行っています)

   メンバーを増減する場合は、下の MEMBERS 配列と、
   index.html側の対応する .member-card の data-member-id を
   合わせて編集してください。
========================================================= */

const MEMBERS = [
  { id: "poki",    channelId: "UCBJYyRIMMAELbPYBoz9jg3w" },
  { id: "memi",    channelId: "UCOkgVkf6Q6fJzEKW2IChvoA" },
  { id: "soruto",  channelId: "UCqmL8ZUOl7C-lhuh8AhZYTQ" },
  { id: "yuuri",   channelId: "UCq5jSnPMGeNF370lfDi2qYg" },
  { id: "chon",    channelId: "UCiNwl-dJn4Z3RT0y-FydL1Q" },
  { id: "shizuku", channelId: "UC8vFX6yFUjwdcGTajaJJ8kg" },
];

/* 判定にかける最大待ち時間(ミリ秒)。この時間内に「再生できた」と分からなければ
   「配信していない」とみなします。 */
const DETECTION_TIMEOUT_MS = 9000;

/* 何分おきに再チェックするか(ページを開いたままの人のため) */
const RECHECK_MINUTES = 3;
const RECHECK_MS = RECHECK_MINUTES * 60 * 1000;

let activePlayers = [];

function setLiveState(memberId, isLive) {
  const card = document.querySelector(`.member-card[data-member-id="${memberId}"]`);
  if (card) card.classList.toggle("is-live", isLive);
}

function destroyActivePlayers() {
  activePlayers.forEach((player) => {
    try { player.destroy(); } catch (e) { /* すでに破棄済みなどは無視 */ }
  });
  activePlayers = [];
  const container = document.getElementById("live-probes");
  if (container) container.innerHTML = "";
}

function probeMember(member) {
  const container = document.getElementById("live-probes");
  if (!container) return;

  const wrap = document.createElement("div");
  wrap.id = `live-probe-${member.id}`;
  container.appendChild(wrap);

  const iframe = document.createElement("iframe");
  iframe.width = "200";
  iframe.height = "113";
  iframe.setAttribute("allow", "autoplay");
  iframe.src = `https://www.youtube.com/embed/live_stream?channel=${member.channelId}&enablejsapi=1&autoplay=1&mute=1&controls=0&playsinline=1`;
  wrap.appendChild(iframe);

  let settled = false;
  const finish = (isLive) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    setLiveState(member.id, isLive);
  };

  const timeoutId = setTimeout(() => finish(false), DETECTION_TIMEOUT_MS);

  try {
    const player = new YT.Player(iframe, {
      events: {
        onReady: (e) => {
          try { e.target.mute(); e.target.playVideo(); } catch (err) { /* noop */ }
        },
        onStateChange: (e) => {
          // 1 = 再生中, 3 = バッファリング中 → どちらも「配信を捉えられた」とみなす
          if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING) {
            finish(true);
          }
        },
        onError: () => finish(false),
      },
    });
    activePlayers.push(player);
  } catch (err) {
    console.warn(`[pkpl] ${member.id} の判定用プレイヤー作成に失敗しました`, err);
    finish(false);
  }
}

function runAllProbes() {
  destroyActivePlayers();
  MEMBERS.forEach(probeMember);
}

/* YouTube IFrame Player APIの読み込み完了時に呼ばれる(グローバル関数である必要があります) */
window.onYouTubeIframeAPIReady = function () {
  runAllProbes();
  setInterval(runAllProbes, RECHECK_MS);
};

/* IFrame Player APIのスクリプトを読み込む */
(function loadYouTubeIframeAPI() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();
