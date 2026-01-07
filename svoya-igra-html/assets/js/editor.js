// assets/js/editor.js
// Единый редактор: игры (по gameId), раунды, темы, вопросы, спец-вопросы

const btnCreateGame = document.getElementById("btnCreateGame");
const btnAddRound = document.getElementById("btnAddRound");
const roundSelect = document.getElementById("roundSelect");
const statusEl = document.getElementById("status");
const gameIdText = document.getElementById("gameIdText");
const gridEl = document.getElementById("grid");

// modal
const modalEl = document.getElementById("modal");
const closeModalBtn = document.getElementById("closeModal");
const modalTitleEl = document.getElementById("modalTitle");
const qTextEl = document.getElementById("qText");
const aTextEl = document.getElementById("aText");
const saveBtn = document.getElementById("saveBtn");
const modalMsgEl = document.getElementById("modalMsg");

// specials (modal)
const specialKindEl = document.getElementById("specialKind");
const specialPayloadEl = document.getElementById("specialPayload");

const VALUES = [100, 200, 300, 400, 500];

let currentGameId = null;
let currentRound = 1;

let topics = [];               // [{id, idx, title}]
let questionsMap = new Map();  // key `${topic_idx}-${value}` -> row
let specialByQuestionId = new Map(); // question_id -> { id, kind, payload }
let currentEdit = null;        // {topic_idx, value}

function setStatus(text) {
  statusEl.textContent = text || "";
}

function getGameIdFromUrl() {
  return new URLSearchParams(location.search).get("gameId");
}

function setGameId(gameId) {
  currentGameId = gameId;
  gameIdText.textContent = gameId || "—";
  btnAddRound.disabled = !gameId;
  roundSelect.disabled = !gameId;
}

function updateUrlGameId(gameId) {
  const url = new URL(location.href);
  url.searchParams.set("gameId", gameId);
  history.replaceState({}, "", url.toString());
}

function qKey(topic_idx, value) {
  return `${topic_idx}-${value}`;
}

// ---------- GAME ----------
async function loadGameTitle(gameId) {
  const { data, error } = await window.supabase
    .from("games")
    .select("id,title")
    .eq("id", gameId)
    .single();

  if (error) throw error;

  document.title = `Редактор — ${data.title ?? "Своя игра"}`;
}

// ---------- ROUNDS ----------
async function loadRounds(gameId) {
  const { data, error } = await window.supabase
    .from("rounds")
    .select("round_num,title")
    .eq("game_id", gameId)
    .order("round_num", { ascending: true });

  if (error) throw error;

  // если раундов нет — создадим Раунд 1 автоматически
  if (!data || data.length === 0) {
    await ensureRoundExists(gameId, 1);
    await ensureTopics(gameId, 1);
    return loadRounds(gameId);
  }

  roundSelect.innerHTML = data
    .map(r => `<option value="${r.round_num}">${r.title}</option>`)
    .join("");

  const exists = data.some(r => r.round_num === currentRound);
  currentRound = exists ? currentRound : data[0].round_num;
  roundSelect.value = String(currentRound);
}

async function ensureRoundExists(gameId, roundNum) {
  const { data, error } = await window.supabase
    .from("rounds")
    .upsert(
      { game_id: gameId, round_num: roundNum, title: `Раунд ${roundNum}` },
      { onConflict: "game_id,round_num" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createNextRound(gameId) {
  const { data, error } = await window.supabase
    .from("rounds")
    .select("round_num")
    .eq("game_id", gameId)
    .order("round_num", { ascending: false })
    .limit(1);

  if (error) throw error;

  const nextNum = (data?.[0]?.round_num ?? 0) + 1;

  await ensureRoundExists(gameId, nextNum);
  await ensureTopics(gameId, nextNum);

  return nextNum;
}

// ---------- TOPICS + QUESTIONS ----------
async function ensureTopics(gameId, roundNum) {
  const { data, error } = await window.supabase
    .from("topics")
    .select("id,idx,title")
    .eq("game_id", gameId)
    .eq("round", roundNum)
    .order("idx", { ascending: true });

  if (error) throw error;

  if (data && data.length === 5) return data;

  const rows = Array.from({ length: 5 }).map((_, idx) => ({
    game_id: gameId,
    round: roundNum,
    idx,
    title: `Тема ${idx + 1}`
  }));

  const ins = await window.supabase
    .from("topics")
    .upsert(rows, { onConflict: "game_id,round,idx" })
    .select();

  if (ins.error) throw ins.error;

  return (ins.data || []).sort((a, b) => a.idx - b.idx);
}

async function loadQuestions(gameId, roundNum) {
  const { data, error } = await window.supabase
    .from("questions")
    .select("id,topic_idx,value,question_text,answer_text,is_used")
    .eq("game_id", gameId)
    .eq("round", roundNum);

  if (error) throw error;

  questionsMap = new Map();
  for (const q of (data || [])) {
    questionsMap.set(qKey(q.topic_idx, q.value), q);
  }
}

async function loadSpecials(gameId, roundNum) {
  const { data, error } = await window.supabase
    .from("special_questions")
    .select("id,question_id,kind,payload")
    .eq("game_id", gameId)
    .eq("round_num", roundNum);

  if (error) throw error;

  specialByQuestionId = new Map();
  for (const s of (data || [])) {
    if (s.question_id) specialByQuestionId.set(s.question_id, s);
  }
}

// ---------- UI GRID ----------
function renderGrid() {
  const head = `
    <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; margin-bottom:10px;">
      ${topics.map(t => `
        <div style="border:1px solid #ccc; padding:8px; background:#fff; color:#000;">
          <input data-topic-title="${t.idx}" value="${t.title}" style="width:100%; font-weight:700; padding:6px;" />
        </div>
      `).join("")}
    </div>
  `;

  const rows = VALUES.map(v => {
    const cells = topics.map(t => {
      const existing = questionsMap.get(qKey(t.idx, v));
      const label = existing ? `✅ ${v}` : `${v}`;
      return `<button data-cell="${t.idx}-${v}" style="padding:14px; border:1px solid #ccc; width:100%;">${label}</button>`;
    }).join("");
    return `<div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; margin-bottom:10px;">${cells}</div>`;
  }).join("");

  gridEl.innerHTML = head + rows;

  // click cells
  gridEl.querySelectorAll("button[data-cell]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [topic_idx, value] = btn.dataset.cell.split("-").map(Number);
      openModal(topic_idx, value);
    });
  });

  // rename topics
  gridEl.querySelectorAll("input[data-topic-title]").forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") inp.blur();
    });
    inp.addEventListener("blur", async () => {
      const idx = Number(inp.dataset.topicTitle);
      await renameTopic(idx, inp.value);
    });
  });
}

async function renameTopic(topicIdx, newTitle) {
  const t = topics.find(x => x.idx === topicIdx);
  if (!t) return;

  const title = (newTitle || "").trim() || `Тема ${topicIdx + 1}`;

  const { error } = await window.supabase
    .from("topics")
    .update({ title })
    .eq("id", t.id);

  if (error) {
    alert("Ошибка сохранения темы: " + error.message);
    console.error(error);
    return;
  }

  t.title = title;
  renderGrid();
}

// ---------- MODAL ----------
function openModal(topic_idx, value) {
  currentEdit = { topic_idx, value };

  const t = topics.find(x => x.idx === topic_idx)?.title ?? `Тема ${topic_idx + 1}`;
  modalTitleEl.textContent = `Раунд ${currentRound} • ${t} • ${value}`;

  const existing = questionsMap.get(qKey(topic_idx, value));
  qTextEl.value = existing?.question_text ?? "";
  aTextEl.value = existing?.answer_text ?? "";
  modalMsgEl.textContent = existing ? "Редактирование сохранённого вопроса." : "Новый вопрос.";

  // спец-вопросы: подстановка
  specialKindEl.value = "";
  specialPayloadEl.value = "";

  if (existing?.id) {
    const sp = specialByQuestionId.get(existing.id);
    if (sp) {
      specialKindEl.value = sp.kind || "";
      try {
        specialPayloadEl.value = JSON.stringify(sp.payload ?? {}, null, 2);
      } catch {
        specialPayloadEl.value = "{}";
      }
    }
  }

  modalEl.style.display = "block";
}

function closeModal() {
  modalEl.style.display = "none";
  currentEdit = null;
}
closeModalBtn.addEventListener("click", closeModal);
modalEl.addEventListener("click", (e) => {
  if (e.target === modalEl) closeModal();
});

saveBtn.addEventListener("click", async () => {
  if (!currentEdit) return;

  const question_text = (qTextEl.value || "").trim();
  const answer_text = (aTextEl.value || "").trim();

  if (!question_text || !answer_text) {
    modalMsgEl.textContent = "Заполни и вопрос, и ответ.";
    return;
  }

  saveBtn.disabled = true;
  modalMsgEl.textContent = "Сохраняю...";

  const payload = {
    game_id: currentGameId,
    round: currentRound,
    topic_idx: currentEdit.topic_idx,
    value: currentEdit.value,
    qtype: "text",
    question_text,
    answer_text,
    is_used: false
  };

  const { data, error } = await window.supabase
    .from("questions")
    .upsert(payload, { onConflict: "game_id,round,topic_idx,value" })
    .select()
    .single();

  if (error) {
    console.error(error);
    saveBtn.disabled = false;
    modalMsgEl.textContent = "Ошибка: " + error.message;
    return;
  }

  // ===== спец-вопросы: сохранить/удалить =====
  const kind = (specialKindEl.value || "").trim();
  let payloadObj = {};

  const payloadRaw = (specialPayloadEl.value || "").trim();
  if (payloadRaw) {
    try {
      payloadObj = JSON.parse(payloadRaw);
    } catch {
      // вопрос уже сохранён — просто предупреждаем
      questionsMap.set(qKey(currentEdit.topic_idx, currentEdit.value), data);
      renderGrid();
      saveBtn.disabled = false;
      modalMsgEl.textContent = "⚠️ Payload JSON невалидный. Исправь JSON или очисти поле.";
      return;
    }
  }

  // Удаляем старые спец-записи для этого вопроса (чтобы 1 вопрос = 1 спец)
  const del = await window.supabase
    .from("special_questions")
    .delete()
    .eq("game_id", currentGameId)
    .eq("question_id", data.id);

  if (del.error) {
    console.error(del.error);
    // не фейлим сохранение вопроса
  } else {
    specialByQuestionId.delete(data.id);
  }

  if (kind) {
    const ins = await window.supabase
      .from("special_questions")
      .insert({
        game_id: currentGameId,
        round_num: currentRound,
        kind,
        question_id: data.id,
        payload: payloadObj,
        is_used: false
      })
      .select()
      .single();

    if (ins.error) {
      console.error(ins.error);
      // не фейлим сохранение вопроса
      modalMsgEl.textContent = "⚠️ Вопрос сохранён, но спец-вопрос не записался: " + ins.error.message;
    } else {
      specialByQuestionId.set(data.id, ins.data);
    }
  }

  questionsMap.set(qKey(currentEdit.topic_idx, currentEdit.value), data);
  renderGrid();

  saveBtn.disabled = false;
  modalMsgEl.textContent = "Сохранено ✅";
});

// ---------- INIT / EVENTS ----------
async function refreshAll() {
  if (!currentGameId) {
    gridEl.textContent = "Открой игру из Lobby (Editor) или создай новую игру.";
    return;
  }

  setStatus("Загружаю…");
  await loadGameTitle(currentGameId);

  await loadRounds(currentGameId);

  topics = await ensureTopics(currentGameId, currentRound);
  await loadQuestions(currentGameId, currentRound);
  await loadSpecials(currentGameId, currentRound);

  renderGrid();
  setStatus("");
}

btnCreateGame.addEventListener("click", async () => {
  try {
    btnCreateGame.disabled = true;
    setStatus("Создаю игру…");

    const title = prompt("Название игры:", "Новая игра");
    if (title === null) { setStatus(""); return; }

    const { data, error } = await window.supabase
      .from("games")
      .insert({ title: title || "Новая игра", phase: "board", show_answer: false, active_question_id: null })
      .select()
      .single();

    if (error) throw error;

    setGameId(data.id);
    updateUrlGameId(data.id);

    // первый раунд + темы
    await ensureRoundExists(data.id, 1);
    await ensureTopics(data.id, 1);

    currentRound = 1;
    await refreshAll();
    setStatus("✅ Игра создана");
  } catch (e) {
    console.error(e);
    alert("Ошибка создания игры: " + e.message);
    setStatus("❌ Ошибка");
  } finally {
    btnCreateGame.disabled = false;
  }
});

btnAddRound.addEventListener("click", async () => {
  if (!currentGameId) return;

  try {
    btnAddRound.disabled = true;
    setStatus("Создаю раунд…");

    const newRoundNum = await createNextRound(currentGameId);
    currentRound = newRoundNum;

    await refreshAll();
    setStatus(`✅ Добавлен Раунд ${newRoundNum}`);
  } catch (e) {
    console.error(e);
    alert("Ошибка создания раунда: " + e.message);
    setStatus("❌ Ошибка");
  } finally {
    btnAddRound.disabled = false;
  }
});

roundSelect.addEventListener("change", async () => {
  currentRound = Number(roundSelect.value);
  await refreshAll();
});

// старт
(async function init() {
  const urlGameId = getGameIdFromUrl();
  if (urlGameId) {
    setGameId(urlGameId);
    await refreshAll();
  } else {
    setGameId(null);
    gridEl.textContent = "Открой игру из Lobby (Editor) или создай новую игру.";
  }
})();
