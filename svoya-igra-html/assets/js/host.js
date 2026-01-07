// assets/js/host.js
// Ведущий: открывает табло (iframe), начисляет очки, показывает/прячет ответ,
// и закрывает окно вопроса + помечает вопрос used на "Назад на табло".

console.log("HOST.JS VERSION: 2026-01-06 popup-from-play + used-on-back");

(async function init() {
  const params = new URLSearchParams(location.search);
  const gameId = params.get("gameId");

  const statusEl = document.getElementById("status");
  const debugEl = document.getElementById("debug");

  const btnBoard = document.getElementById("btnBoard");             // "Табло"
  const btnShowAnswer = document.getElementById("btnShowAnswer");   // "Показать ответ"
  const btnBackToBoard = document.getElementById("btnBackToBoard"); // "Назад на табло"

  const hostTabloWrap = document.getElementById("hostTabloWrap");
  const hostTabloFrame = document.getElementById("hostTabloFrame");
  const hostMain = document.getElementById("hostMain");

  const playersCountEl = document.getElementById("playersCount");
  const btnApplyPlayers = document.getElementById("btnApplyPlayers");
  const btnResetScores = document.getElementById("btnResetScores");
  const playersListHostEl = document.getElementById("playersListHost");

  const client = window.supabase;

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t;
  }
  function log(obj) {
    if (!debugEl) return;
    debugEl.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  }

  if (!client || typeof client.from !== "function") {
    setStatus("❌ Supabase не подключён (проверь supabase.js)");
    return;
  }
  if (!gameId) {
    setStatus("❌ Нет gameId в URL (?gameId=...)");
    return;
  }

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const safeInt = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  // --------- state ----------
  let currentGame = null;
  let players = [];
  let idxBase = 1;

  let activeQuestion = null;
  let activeValue = 0;

  // --------- window close helper ----------
  function closeQuestionWindow() {
    try {
      const w = window.open("", "QuestionWindow");
      if (w && !w.closed) w.close();
    } catch (e) {
      // если браузер не даст закрыть — ок, question.js всё равно покажет "ожидание"
      console.warn("closeQuestionWindow warn:", e);
    }
  }

  // --------- UI: tablo iframe ----------
  function openTablo() {
    if (!hostTabloWrap || !hostTabloFrame || !hostMain) return;

    hostMain.classList.add("hidden");
    hostTabloWrap.style.display = "block";

    // Ведущему нужны клики -> host=1. round=0 по умолчанию.
    hostTabloFrame.src = `../play/index.html?gameId=${encodeURIComponent(gameId)}&tv=1&host=1&round=0`;
  }

  function closeTablo() {
    if (!hostTabloWrap || !hostTabloFrame || !hostMain) return;

    hostTabloWrap.style.display = "none";
    hostMain.classList.remove("hidden");
    hostTabloFrame.src = "about:blank";
  }

  // --------- DB loaders ----------
  async function loadGame() {
    const { data, error } = await client
      .from("games")
      .select("id,title,phase,active_question_id,show_answer")
      .eq("id", gameId)
      .single();
    if (error) throw error;
    return data;
  }

  async function loadPlayers() {
    const { data, error } = await client
      .from("players")
      .select("id,game_id,idx,name,score,avatar_url")
      .eq("game_id", gameId)
      .order("idx", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function loadQuestionById(questionId) {
    if (!questionId) return null;
    const { data, error } = await client
      .from("questions")
      .select("id, topic_idx, value, qtype, question_text, answer_text, media_url, is_used")
      .eq("id", questionId)
      .single();
    if (error) {
      console.error("loadQuestionById error:", error);
      return null;
    }
    return data;
  }

  async function setGamePatch(patch) {
    const { error } = await client.from("games").update(patch).eq("id", gameId);
    if (error) throw error;
  }

  function detectIdxBase(playersArr) {
    return (playersArr || []).some((p) => Number(p.idx) === 0) ? 0 : 1;
  }

  // --------- actions ----------
  async function showAnswer() {
    await setGamePatch({ phase: "answer", show_answer: true });
  }

  async function backToBoard() {
    // 1) помечаем использованным
    if (currentGame?.active_question_id) {
      const { error: qErr } = await client
        .from("questions")
        .update({ is_used: true })
        .eq("id", currentGame.active_question_id);

      if (qErr) console.error("mark used error:", qErr);
    }

    // 2) сбрасываем игру
    await setGamePatch({ phase: "board", show_answer: false, active_question_id: null });

    // 3) закрываем окно вопроса
    closeQuestionWindow();

    activeQuestion = null;
    activeValue = 0;
  }

  async function ensurePlayersCount(targetCount) {
    targetCount = clamp(targetCount, 2, 6);

    players = await loadPlayers();
    idxBase = detectIdxBase(players);

    const wantedIdx = [];
    for (let i = 0; i < targetCount; i++) wantedIdx.push(idxBase + i);

    const byIdx = new Map(players.map((p) => [Number(p.idx), p]));
    const toInsert = [];

    for (const idx of wantedIdx) {
      if (!byIdx.has(idx)) {
        toInsert.push({
          game_id: gameId,
          idx,
          name: `Игрок ${idx - idxBase + 1}`,
          score: 0,
          avatar_url: "",
        });
      }
    }

    if (toInsert.length) {
      const { error } = await client.from("players").insert(toInsert);
      if (error) throw error;
    }

    players = await loadPlayers();
    idxBase = detectIdxBase(players);

    if (playersCountEl) playersCountEl.value = String(targetCount);
    renderPlayersHost(targetCount);
  }

  async function resetScores() {
    const { error } = await client.from("players").update({ score: 0 }).eq("game_id", gameId);
    if (error) throw error;

    players = await loadPlayers();
    renderPlayersHost(safeInt(playersCountEl?.value, 2));
  }

  async function updatePlayer(id, patch) {
    const { error } = await client.from("players").update(patch).eq("id", id);
    if (error) throw error;
  }

  // --------- render players ----------
  function renderPlayersHost(targetCount) {
    if (!playersListHostEl) return;
    playersListHostEl.innerHTML = "";

    const count = clamp(safeInt(targetCount, 2), 2, 6);

    const wantedIdx = [];
    for (let i = 0; i < count; i++) wantedIdx.push(idxBase + i);

    const byIdx = new Map(players.map((p) => [Number(p.idx), p]));

    wantedIdx.forEach((idx) => {
      const p = byIdx.get(idx);
      if (!p) return;

      const row = document.createElement("div");
      row.className = "player-row";

      const nameInput = document.createElement("input");
      nameInput.className = "player-name-input";
      nameInput.type = "text";
      nameInput.value = p.name || "";
      nameInput.placeholder = `Игрок ${idx - idxBase + 1}`;

      const score = document.createElement("div");
      score.className = "player-score";
      score.textContent = String(p.score ?? 0);

      const btnMinus100 = document.createElement("button");
      btnMinus100.type = "button";
      btnMinus100.textContent = "−100";
      btnMinus100.className = "btn small";

      const btnPlus100 = document.createElement("button");
      btnPlus100.type = "button";
      btnPlus100.textContent = "+100";
      btnPlus100.className = "btn small";

      const btnMinusQ = document.createElement("button");
      btnMinusQ.type = "button";
      btnMinusQ.textContent = activeValue ? `−${activeValue}` : "−?";
      btnMinusQ.className = "btn small";

      const btnPlusQ = document.createElement("button");
      btnPlusQ.type = "button";
      btnPlusQ.textContent = activeValue ? `+${activeValue}` : "+?";
      btnPlusQ.className = "btn small";

      if (!activeValue) {
        btnMinusQ.disabled = true;
        btnPlusQ.disabled = true;
      }

      row.appendChild(nameInput);
      row.appendChild(score);
      row.appendChild(btnMinus100);
      row.appendChild(btnPlus100);
      row.appendChild(btnMinusQ);
      row.appendChild(btnPlusQ);

      playersListHostEl.appendChild(row);

      nameInput.addEventListener("change", async () => {
        try {
          await updatePlayer(p.id, { name: nameInput.value.trim() || p.name });
        } catch (e) {
          console.error(e);
          setStatus("❌ Ошибка имени");
          log(e);
        }
      });

      btnMinus100.addEventListener("click", async () => {
        try {
          await updatePlayer(p.id, { score: safeInt(p.score, 0) - 100 });
        } catch (e) {
          console.error(e);
          setStatus("❌ Ошибка счёта");
          log(e);
        }
      });

      btnPlus100.addEventListener("click", async () => {
        try {
          await updatePlayer(p.id, { score: safeInt(p.score, 0) + 100 });
        } catch (e) {
          console.error(e);
          setStatus("❌ Ошибка счёта");
          log(e);
        }
      });

      btnMinusQ.addEventListener("click", async () => {
        if (!activeValue) return;
        try {
          await updatePlayer(p.id, { score: safeInt(p.score, 0) - activeValue });
        } catch (e) {
          console.error(e);
          setStatus("❌ Ошибка начисления");
          log(e);
        }
      });

      btnPlusQ.addEventListener("click", async () => {
        if (!activeValue) return;
        try {
          await updatePlayer(p.id, { score: safeInt(p.score, 0) + activeValue });
        } catch (e) {
          console.error(e);
          setStatus("❌ Ошибка начисления");
          log(e);
        }
      });
    });
  }

  // --------- realtime handlers ----------
  async function handleGameUpdate(newGame) {
    currentGame = newGame;

    if (currentGame.active_question_id) {
      activeQuestion = await loadQuestionById(currentGame.active_question_id);
      activeValue = activeQuestion?.value ? Number(activeQuestion.value) : 0;
    } else {
      activeQuestion = null;
      activeValue = 0;
    }

    renderPlayersHost(safeInt(playersCountEl?.value, 2));
    setStatus(`🎮 ${currentGame?.title || "Игра"} | phase: ${currentGame?.phase} | +${activeValue || "?"}`);
  }

  function subscribeRealtime() {
    client
      .channel(`host:game:${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        async (payload) => {
          await handleGameUpdate(payload.new);
        }
      )
      .subscribe();

    client
      .channel(`host:players:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` },
        async () => {
          players = await loadPlayers();
          idxBase = detectIdxBase(players);
          renderPlayersHost(safeInt(playersCountEl?.value, 2));
        }
      )
      .subscribe();
  }

  // --------- BOOT ----------
  try {
    setStatus("⏳ Загрузка…");

    currentGame = await loadGame();

    players = await loadPlayers();
    idxBase = detectIdxBase(players);

    const initialCount = clamp(players.length || 2, 2, 6);
    if (playersCountEl) playersCountEl.value = String(initialCount);

    renderPlayersHost(initialCount);
    await handleGameUpdate(currentGame);

    btnBoard?.addEventListener("click", openTablo);

    btnShowAnswer?.addEventListener("click", async () => {
      try {
        await showAnswer();
      } catch (e) {
        console.error(e);
        setStatus("❌ Ошибка: показать ответ");
        log(e);
      }
    });

    btnBackToBoard?.addEventListener("click", async () => {
      try {
        await backToBoard();
        closeTablo();
      } catch (e) {
        console.error(e);
        setStatus("❌ Ошибка: назад на табло");
        log(e);
      }
    });

    btnApplyPlayers?.addEventListener("click", async () => {
      try {
        const cnt = safeInt(playersCountEl?.value, 2);
        await ensurePlayersCount(cnt);
        setStatus("✅ Игроки применены");
      } catch (e) {
        console.error(e);
        setStatus("❌ Ошибка: применить игроков");
        log(e);
      }
    });

    btnResetScores?.addEventListener("click", async () => {
      try {
        await resetScores();
        setStatus("✅ Очки сброшены");
      } catch (e) {
        console.error(e);
        setStatus("❌ Ошибка: сброс очков");
        log(e);
      }
    });

    subscribeRealtime();
  } catch (e) {
    console.error(e);
    setStatus("❌ Ошибка host.js: " + (e?.message || String(e)));
    log(e);
  }
})();
