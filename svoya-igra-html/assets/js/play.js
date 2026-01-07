// assets/js/play.js
// Табло ONLY. В tv=1 клики выключены. В host=1 клики включены.
// Клик по клетке: открывает отдельное окно question + обновляет games (phase/question + active_question_id).
// ВАЖНО: is_used НЕ ставим здесь — это делает host на "Назад на табло".

(async function init() {
  const params = new URLSearchParams(location.search);

  const gameId = params.get("gameId");
  if (!gameId) {
    alert("Нет gameId в URL (?gameId=...)");
    throw new Error("gameId missing");
  }

  const supabase = window.supabase;
  if (!supabase) {
    alert("Supabase клиент не найден. Проверь assets/js/supabase.js");
    throw new Error("supabase missing");
  }

  const isTv = params.get("tv") === "1";
  const isHost = params.get("host") === "1";

  // round: в твоём редакторе часто 0
  let round = Number(params.get("round") ?? 0);

  const boardEl = document.getElementById("board");
  const playersBarEl = document.getElementById("playersBar");

  let questionsIndex = new Map(); // `${topic_idx}:${value}` => question row
  let players = [];

  // ---------- helpers ----------
  function attachCellDataAttrs() {
    if (!boardEl) return;
    const rows = boardEl.querySelectorAll("tbody tr");
    const values = [100, 200, 300, 400, 500];

    rows.forEach((tr, topicIdx) => {
      const cells = tr.querySelectorAll("td.value");
      cells.forEach((cell, j) => {
        cell.dataset.topicIdx = String(topicIdx);
        cell.dataset.value = String(values[j] ?? "");
      });
    });
  }

  function fillBoardTopics(topics) {
    if (!boardEl) return;
    const topicCells = boardEl.querySelectorAll("td.topic");
    topicCells.forEach((cell, i) => {
      const t = (topics || []).find((x) => Number(x.idx) === i);
      cell.textContent = (t?.title || `ТЕМА ${i + 1}`).toUpperCase();
    });
  }

  function buildQuestionsIndex(list) {
    questionsIndex = new Map();
    (list || []).forEach((q) => {
      const key = `${Number(q.topic_idx)}:${Number(q.value)}`;
      questionsIndex.set(key, q);
    });
  }

  function markUsedCells() {
    if (!boardEl) return;
    const valueCells = boardEl.querySelectorAll("td.value");

    valueCells.forEach((cell) => {
      const topicIdx = Number(cell.dataset.topicIdx);
      const val = Number(cell.dataset.value);
      const key = `${topicIdx}:${val}`;
      const q = questionsIndex.get(key);

      if (!q) {
        cell.classList.remove("used");
        return;
      }

      if (q.is_used) cell.classList.add("used");
      else cell.classList.remove("used");
    });
  }

  function renderPlayersBar() {
    if (!playersBarEl) return;
    playersBarEl.innerHTML = "";

    players.forEach((p) => {
      const chip = document.createElement("div");
      chip.className = "player-chip";

      const img = document.createElement("img");
      img.alt = p.name || `Игрок ${p.idx}`;
      img.src = p.avatar_url || "";
      if (!p.avatar_url) img.style.visibility = "hidden";

      const nm = document.createElement("div");
      nm.className = "nm";
      nm.textContent = p.name || `Игрок ${p.idx}`;

      const sc = document.createElement("div");
      sc.className = "sc";
      sc.textContent = String(p.score ?? 0);

      chip.appendChild(img);
      chip.appendChild(nm);
      chip.appendChild(sc);
      playersBarEl.appendChild(chip);
    });
  }

  // ---------- DB loaders ----------
  async function loadTopics() {
    const { data, error } = await supabase
      .from("topics")
      .select("idx,title")
      .eq("game_id", gameId)
      .eq("round", round)
      .order("idx", { ascending: true });

    if (error) {
      console.error("loadTopics error:", error);
      return [];
    }
    return data || [];
  }

  async function loadQuestions() {
    const { data, error } = await supabase
      .from("questions")
      .select("id, topic_idx, value, qtype, question_text, answer_text, media_url, is_used")
      .eq("game_id", gameId)
      .eq("round", round);

    if (error) {
      console.error("loadQuestions error:", error);
      return [];
    }
    return data || [];
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("game_id", gameId)
      .order("idx", { ascending: true });

    if (error) {
      console.error("loadPlayers error:", error);
      return [];
    }
    return data || [];
  }

  // ---------- click -> open question ----------
  function openQuestionWindow(gameIdToOpen) {
    // ВАЖНО: это вызывается прямо из клика — окно не будет заблокировано
    const url = `../question/index.html?gameId=${encodeURIComponent(gameIdToOpen)}`;
    const w = window.open(url, "QuestionWindow", "width=1200,height=800");
    if (!w) {
      alert("Браузер заблокировал окно. Разреши всплывающие окна для 127.0.0.1");
    }
  }

  async function handleCellPick(topicIdx, value) {
    const key = `${Number(topicIdx)}:${Number(value)}`;
    const q = questionsIndex.get(key);

    console.log("[PICK]", { round, key, q });

    if (!q) return;
    if (q.is_used) return;
    if (!String(q.question_text || "").trim()) return;

    // 1) открыть окно вопроса
    openQuestionWindow(gameId);

    // 2) обновить состояние игры
    const { error } = await supabase
      .from("games")
      .update({
        phase: "question",
        active_question_id: q.id,
        show_answer: false,
      })
      .eq("id", gameId);

    if (error) {
      console.error("update games error:", error);
      alert("Не удалось открыть вопрос (см. Console F12).");
    }
  }

  function bindBoardClicks() {
    if (!boardEl) return;

    // ТВ — без кликов
    if (isTv && !isHost) return;

    boardEl.addEventListener("click", (e) => {
      const cell = e.target?.closest?.("td.value");
      if (!cell) return;

      if (cell.classList.contains("used")) return;

      const topicIdx = Number(cell.dataset.topicIdx);
      const value = Number(cell.dataset.value);
      if (!Number.isFinite(topicIdx) || !Number.isFinite(value)) return;

      handleCellPick(topicIdx, value);
    });
  }

  // ---------- BOOT ----------
  attachCellDataAttrs();
  bindBoardClicks();

  let topics = await loadTopics();
  let qs = await loadQuestions();

  // fallback round: если round=0 пусто, пробуем round=1
  if (topics.length === 0 && qs.length === 0 && round === 0) {
    round = 1;
    topics = await loadTopics();
    qs = await loadQuestions();
  }

  fillBoardTopics(topics);
  buildQuestionsIndex(qs);
  markUsedCells();

  players = await loadPlayers();
  renderPlayersBar();

  console.log("[play ready]", { gameId, round, topics: topics.length, questions: qs.length, isTv, isHost });

  // ---------- REALTIME ----------
  supabase
    .channel(`play:${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "topics", filter: `game_id=eq.${gameId}` },
      async () => {
        const t = await loadTopics();
        fillBoardTopics(t);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "questions", filter: `game_id=eq.${gameId}` },
      async () => {
        const list = await loadQuestions();
        buildQuestionsIndex(list);
        markUsedCells();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` },
      async () => {
        players = await loadPlayers();
        renderPlayersBar();
      }
    )
    .subscribe();
})();
