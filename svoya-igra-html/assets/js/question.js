// assets/js/question.js
// Показывает вопрос/ответ в отдельном окне по состоянию games.
// Если phase=board — показывает "Ожидание вопроса…"

(async function initQuestion() {
  const client = window.supabase;
  const params = new URLSearchParams(location.search);
  const gameId = params.get("gameId");

  const qTopic = document.getElementById("qTopic");
  const qValue = document.getElementById("qValue");
  const qPrompt = document.getElementById("qPrompt");
  const qAnswer = document.getElementById("qAnswer");
  const qImage = document.getElementById("qImage");
  const qAudio = document.getElementById("qAudio");

  if (!client) {
    console.error("supabase client not found (check supabase.js)");
    return;
  }
  if (!gameId) {
    if (qPrompt) qPrompt.textContent = "Нет gameId в URL (?gameId=...)";
    return;
  }

  const hide = (el) => el && el.classList.add("hidden");
  const show = (el) => el && el.classList.remove("hidden");

  function resetMedia() {
    if (qImage) { qImage.src = ""; hide(qImage); }
    if (qAudio) { try { qAudio.pause(); } catch {} qAudio.src = ""; hide(qAudio); }
  }

  function showWaiting() {
    resetMedia();
    if (qTopic) qTopic.textContent = "";
    if (qValue) qValue.textContent = "";
    if (qPrompt) qPrompt.textContent = "Ожидание вопроса…";
    if (qAnswer) { qAnswer.textContent = ""; hide(qAnswer); }
  }

  async function loadQuestion(questionId) {
    const { data, error } = await client
      .from("questions")
      .select("id, topic_idx, value, qtype, question_text, answer_text, media_url")
      .eq("id", questionId)
      .single();

    if (error) {
      console.error("loadQuestion error:", error);
      return null;
    }
    return data;
  }

  async function applyGameState(game) {
    if (!game || game.phase === "board" || !game.active_question_id) {
      showWaiting();
      return;
    }

    const q = await loadQuestion(game.active_question_id);
    if (!q) {
      if (qPrompt) qPrompt.textContent = "Не удалось загрузить вопрос";
      return;
    }

    resetMedia();

    if (qTopic) qTopic.textContent = (q.topic_idx != null) ? `Тема ${Number(q.topic_idx) + 1}` : "";
    if (qValue) qValue.textContent = (q.value != null) ? String(q.value) : "";
    if (qPrompt) qPrompt.textContent = q.question_text || "";

    if (q.qtype === "image" && q.media_url && qImage) {
      qImage.src = q.media_url;
      show(qImage);
    }

    if (q.qtype === "audio" && q.media_url && qAudio) {
      qAudio.src = q.media_url;
      show(qAudio);
    }

    if (qAnswer) {
      qAnswer.textContent = q.answer_text || "";
      if (game.phase === "answer" || game.show_answer) show(qAnswer);
      else hide(qAnswer);
    }
  }

  async function loadGameOnce() {
    const { data, error } = await client
      .from("games")
      .select("id, phase, active_question_id, show_answer")
      .eq("id", gameId)
      .single();

    if (error) {
      console.error("loadGameOnce error:", error);
      if (qPrompt) qPrompt.textContent = "Ошибка загрузки игры";
      return null;
    }
    return data;
  }

  // первичная загрузка
  const game = await loadGameOnce();
  await applyGameState(game);

  // realtime: следим за games
  client
    .channel(`question:${gameId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      async (payload) => {
        await applyGameState(payload.new);
      }
    )
    .subscribe();
})();
