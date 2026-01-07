// assets/js/players.js
// Модуль игроков: создание 2..6, имена, очки, аватары (JPEG), realtime

export function createPlayersModule({ supabase, gameId }) {
  if (!supabase) throw new Error('supabase required');
  if (!gameId) throw new Error('gameId required');

  async function loadPlayers() {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('idx', { ascending: true });

    if (error) {
      console.error('loadPlayers error:', error);
      return [];
    }
    return data || [];
  }

  async function insertMissingPlayers(existingPlayers, targetCount) {
    const existingIdx = new Set(existingPlayers.map(p => p.idx));
    const toInsert = [];

    for (let i = 1; i <= targetCount; i++) {
      if (!existingIdx.has(i)) {
        toInsert.push({
          game_id: gameId,
          idx: i,
          name: `Игрок ${i}`,
          score: 0,
          avatar_url: null
        });
      }
    }

    if (toInsert.length) {
      const { error } = await supabase.from('players').insert(toInsert);
      if (error) console.error('insertMissingPlayers error:', error);
    }
  }

  async function deleteExtraPlayers(targetCount) {
    const { error } = await supabase
      .from('players')
      .delete()
      .eq('game_id', gameId)
      .gt('idx', targetCount);

    if (error) console.error('deleteExtraPlayers error:', error);
  }

  async function setPlayersCount(targetCount) {
    const current = await loadPlayers();
    await insertMissingPlayers(current, targetCount);
    await deleteExtraPlayers(targetCount);
    return await loadPlayers();
  }

  async function updatePlayer(idx, patch) {
    const { error } = await supabase
      .from('players')
      .update(patch)
      .eq('game_id', gameId)
      .eq('idx', idx);

    if (error) console.error('updatePlayer error:', error);
  }

  async function resetScores() {
    const { error } = await supabase
      .from('players')
      .update({ score: 0 })
      .eq('game_id', gameId);

    if (error) console.error('resetScores error:', error);
  }

  async function uploadAvatarJPEG(file, idx) {
    if (!file) return null;

    const isJpeg =
      file.type === 'image/jpeg' ||
      file.name.toLowerCase().endsWith('.jpg') ||
      file.name.toLowerCase().endsWith('.jpeg');

    if (!isJpeg) {
      alert('Только JPEG (jpg/jpeg)');
      return null;
    }

    const path = `${gameId}/player-${idx}.jpg`;

    const { error: upErr } = await supabase
      .storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: 'image/jpeg' });

    if (upErr) {
      console.error('upload error:', upErr);
      alert('Ошибка загрузки аватара');
      return null;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data?.publicUrl || null;
  }

  function subscribePlayers(onChange) {
    return supabase
      .channel(`players:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        async () => {
          const list = await loadPlayers();
          onChange?.(list);
        }
      )
      .subscribe();
  }

  // -------- renderers --------
  function renderPlayersHost(players, els) {
    const { listEl, countEl } = els;
    if (!listEl) return;

    listEl.innerHTML = '';

    players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'player-card';

      const img = document.createElement('img');
      img.className = 'player-avatar';
      img.alt = p.name || `Игрок ${p.idx}`;
      img.src = p.avatar_url || '';
      if (!p.avatar_url) img.style.visibility = 'hidden';

      const meta = document.createElement('div');
      meta.className = 'player-meta';

      const row = document.createElement('div');
      row.className = 'player-row';

      const nameInput = document.createElement('input');
      nameInput.className = 'player-name';
      nameInput.value = p.name || `Игрок ${p.idx}`;
      nameInput.placeholder = `Игрок ${p.idx}`;
      nameInput.addEventListener('change', async () => {
        const nextName = nameInput.value.trim() || `Игрок ${p.idx}`;
        await updatePlayer(p.idx, { name: nextName });
      });

      const scoreBox = document.createElement('div');
      scoreBox.className = 'player-score';
      scoreBox.textContent = String(p.score ?? 0);

      row.appendChild(nameInput);
      row.appendChild(scoreBox);

      const actions = document.createElement('div');
      actions.className = 'player-actions';

      const btnMinus = document.createElement('button');
      btnMinus.type = 'button';
      btnMinus.textContent = '−100';
      btnMinus.addEventListener('click', async () => {
        await updatePlayer(p.idx, { score: (p.score ?? 0) - 100 });
      });

      const btnPlus = document.createElement('button');
      btnPlus.type = 'button';
      btnPlus.textContent = '+100';
      btnPlus.addEventListener('click', async () => {
        await updatePlayer(p.idx, { score: (p.score ?? 0) + 100 });
      });

      const btnZero = document.createElement('button');
      btnZero.type = 'button';
      btnZero.textContent = '0';
      btnZero.addEventListener('click', async () => {
        await updatePlayer(p.idx, { score: 0 });
      });

      const upload = document.createElement('input');
      upload.type = 'file';
      upload.accept = 'image/jpeg,.jpg,.jpeg';
      upload.className = 'player-upload';
      upload.addEventListener('change', async () => {
        const file = upload.files?.[0];
        if (!file) return;
        const url = await uploadAvatarJPEG(file, p.idx);
        if (url) await updatePlayer(p.idx, { avatar_url: url });
        upload.value = '';
      });

      actions.appendChild(btnMinus);
      actions.appendChild(btnPlus);
      actions.appendChild(btnZero);
      actions.appendChild(upload);

      meta.appendChild(row);
      meta.appendChild(actions);

      card.appendChild(img);
      card.appendChild(meta);
      listEl.appendChild(card);
    });

    if (countEl) {
      const n = Math.min(6, Math.max(2, players.length || 2));
      countEl.value = String(n);
    }
  }

  function renderPlayersBar(players, barEl) {
    if (!barEl) return;
    barEl.innerHTML = '';

    players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'player-chip';

      const img = document.createElement('img');
      img.alt = p.name || `Игрок ${p.idx}`;
      img.src = p.avatar_url || '';
      if (!p.avatar_url) img.style.visibility = 'hidden';

      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = p.name || `Игрок ${p.idx}`;

      const sc = document.createElement('div');
      sc.className = 'sc';
      sc.textContent = String(p.score ?? 0);

      chip.appendChild(img);
      chip.appendChild(nm);
      chip.appendChild(sc);

      barEl.appendChild(chip);
    });
  }

  return {
    loadPlayers,
    setPlayersCount,
    updatePlayer,
    resetScores,
    subscribePlayers,
    renderPlayersHost,
    renderPlayersBar
  };
}
