// assets/js/lobby.js

const listEl = document.getElementById("list");
const createBtn = document.getElementById("createBtn");
const searchEl = document.getElementById("search");
const infoEl = document.getElementById("info");

let games = [];

function pageLink(path, gameId) {
  return `../${path}/index.html?gameId=${gameId}`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Скопировано в буфер обмена ✅");
  } catch {
    prompt("Скопируй вручную:", text);
  }
}

function render(list) {
  infoEl.textContent = `Игр: ${list.length}`;

  if (!list.length) {
    listEl.innerHTML = "<div>Игр нет</div>";
    return;
  }

  listEl.innerHTML = list
    .map(
      (g) => `
      <div style="margin:12px 0; padding:10px; border:1px solid #ccc;">
        <div style="display:flex; justify-content:space-between; gap:12px;">
          <div>
            <div><b>${g.title ?? "Без названия"}</b></div>
            <div style="font-size:12px; opacity:.7;">ID: ${g.id}</div>
            <div style="font-size:12px; opacity:.7;">phase: ${g.phase}</div>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start;">
            <a href="${pageLink("host", g.id)}" target="_blank">Host</a>
            <a href="${pageLink("play", g.id)}" target="_blank">Play</a>
            <a href="${pageLink("editor", g.id)}" target="_blank">Editor</a>
            <a href="${pageLink("scores", g.id)}" target="_blank">Scores</a>

            <button data-copy-host="${g.id}">Копировать Host</button>
            <button data-copy-play="${g.id}">Копировать Play</button>
            <button data-copy-scores="${g.id}">Копировать Scores</button>

            <button data-delete="${g.id}" style="color:#b00;">Удалить</button>
          </div>
        </div>
      </div>
    `
    )
    .join("");

  listEl.onclick = async (e) => {
    const t = e.target;

    if (t.dataset.copyHost) {
      await copy(pageLink("host", t.dataset.copyHost));
      return;
    }

    if (t.dataset.copyPlay) {
      await copy(pageLink("play", t.dataset.copyPlay));
      return;
    }

    if (t.dataset.copyScores) {
      await copy(pageLink("scores", t.dataset.copyScores));
      return;
    }

    if (t.dataset.delete) {
      const id = t.dataset.delete;
      if (!confirm("Удалить игру?")) return;

      const { error } = await window.supabase
        .from("games")
        .delete()
        .eq("id", id);

      if (error) {
        alert("Ошибка удаления: " + error.message);
        console.error(error);
        return;
      }

      await loadGames();
      return;
    }
  };
}

async function loadGames() {
  listEl.textContent = "Загрузка...";

  const { data, error } = await window.supabase
    .from("games")
    .select("id,title,phase,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    listEl.textContent = "Ошибка загрузки: " + error.message;
    return;
  }

  games = data || [];
  applyFilter();
}

function applyFilter() {
  const q = (searchEl.value || "").toLowerCase();
  const filtered = !q
    ? games
    : games.filter((g) => (g.title || "").toLowerCase().includes(q));

  render(filtered);
}

createBtn.addEventListener("click", async () => {
  const title = prompt("Название игры:", "Новая игра");
  if (title === null) return;

  const { data, error } = await window.supabase
    .from("games")
    .insert({ title, phase: "board", show_answer: false })
    .select()
    .single();

  if (error) {
    alert("Ошибка создания: " + error.message);
    console.error(error);
    return;
  }

  window.open(pageLink("host", data.id), "_blank");
  window.open(pageLink("play", data.id), "_blank");
  window.open(pageLink("scores", data.id), "_blank");

  await loadGames();
});

searchEl.addEventListener("input", applyFilter);

loadGames();
