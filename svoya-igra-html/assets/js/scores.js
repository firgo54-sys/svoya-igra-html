// assets/js/scores.js

const client = window.supabase;
const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");

if (!client || typeof client.from !== "function") {
  if (statusEl) statusEl.textContent = "ошибка: supabase не инициализирован";
  if (grid) grid.innerHTML = `<div class="empty">Ошибка: Supabase не подключён. Проверь supabase.js и подключение SDK.</div>`;
  throw new Error("Supabase client missing");
}

const params = new URLSearchParams(location.search);
const gameId = params.get("gameId");

if (!gameId) {
  if (statusEl) statusEl.textContent = "нет gameId в ссылке";
  if (grid) grid.innerHTML = `<div class="empty">Добавь <b>?gameId=...</b> в адрес</div>`;
  throw new Error("Missing gameId");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

function render(players) {
  if (!grid) return;

  if (!players || players.length === 0) {
    grid.innerHTML = `<div class="empty">Игроков пока нет</div>`;
    return;
  }

  grid.innerHTML = players.map(p => `
    <div class="card">
      <div class="left">
        ${
          p.avatar_url
            ? `<img class="avatar" src="${escapeAttr(p.avatar_url)}" alt="">`
            : `<div class="avatar" style="display:flex;align-items:center;justify-content:center;opacity:.5;">?</div>`
        }
        <div class="name">${escapeHtml(p.name || ("Игрок " + (p.idx ?? "")))}</div>
      </div>
      <div class="score">${Number(p.score || 0)}</div>
    </div>
  `).join("");
}

async function loadOnce() {
  const { data, error } = await client
    .from("players")
    .select("id, game_id, idx, name, score, avatar_url")
    .eq("game_id", gameId)
    .order("idx", { ascending: true });

  if (error) {
    if (statusEl) statusEl.textContent = "ошибка загрузки";
    console.error("scores loadOnce error:", error);
    if (grid) grid.innerHTML = `<div class="empty">Ошибка: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (statusEl) statusEl.textContent = "онлайн";
  render(data);
}

// 1) Первичная загрузка
loadOnce();

// 2) Realtime подписка
let channel = null;
try {
  channel = client
    .channel(`scores-${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` },
      async () => {
        await loadOnce();
      }
    )
    .subscribe((s) => {
      if (!statusEl) return;
      if (s === "SUBSCRIBED") statusEl.textContent = "realtime ✅";
      if (s === "CHANNEL_ERROR") statusEl.textContent = "realtime ошибка (обновление по таймеру)";
      if (s === "TIMED_OUT") statusEl.textContent = "realtime таймаут (обновление по таймеру)";
    });
} catch (e) {
  console.warn("Realtime init failed", e);
}

// 3) Запасной вариант: опрос раз в 2 секунды
setInterval(loadOnce, 2000);

// cleanup
window.addEventListener("beforeunload", () => {
  if (channel) client.removeChannel(channel);
});
