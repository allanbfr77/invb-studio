/* INVB Studio — tela de cortes: enviar ao Drive, texto de publicação, sugestões da IA, sincronia da pregação, colar minutagens e novo corte.
   Parte de public/app/clips.js; recebe o objeto "shared" com o estado e as funções da tela de cortes. */
(function () {
  const { api, googleToken, S, G_WRITE, toast, modal, esc, guard, dl, tm, $, go, $$, parseT } = window.INVB.clipsParts.base;

  window.INVB.clipsParts.actions = function (shared) {
    const { c, draw } = shared;

    const sendDrive = async (k) => {
      const post = (t) => api(`/uploads/${c.id}/clips/${k.id}/drive`, { json: { token: t } });
      const fresh = async () => { const t = await googleToken(S.status.driveClientId, G_WRITE, !!S.gPick); S.gPick = false; S.gtok = { t, exp: Date.now() + 45 * 60000 }; return t; };
      let r;
      try { r = await post(S.gtok && S.gtok.exp > Date.now() ? S.gtok.t : await fresh()); }
      catch (e) { if (e.data && e.data.wrongAccount) { S.gtok = null; S.gPick = true; } // conta sem acesso à pasta: o próximo envio pergunta qual conta usar
        if (!(e.data && e.data.needsLogin)) throw e; S.gtok = null; r = await post(await fresh()); } // token vencido: pede o login de novo, uma vez
      k.drive = r.drive; toast(`Corte enviado para a pasta da equipe, com ${r.drive && r.drive.srt ? 'a legenda (.srt) e o texto' : 'o texto'} para a edição.`);
    };
    // Login do Google feito no próprio clique (o navegador bloqueia a janela se ela abrir depois de uma espera longa).
    const driveToken = async () => { if (!(S.gtok && S.gtok.exp > Date.now())) { S.gtok = { t: await googleToken(S.status.driveClientId, G_WRITE, !!S.gPick), exp: Date.now() + 45 * 60000 }; S.gPick = false; } return S.gtok.t; };
    // Texto de publicação do corte (título, descrição e hashtags): dá para ajustar, copiar, usar o título no corte ou pedir outro.
    const postModal = (k) => {
      const m = modal('Texto para publicar', `<label for="po-t">Título</label><input id="po-t" value="${esc(k.post.title)}"><label for="po-d">Descrição</label><textarea id="po-d" rows="5">${esc(k.post.description)}</textarea><label for="po-h">Hashtags</label><textarea id="po-h" rows="2">${esc((k.post.hashtags || []).join(' '))}</textarea><div class="po-x"><button class="ap-btn" id="po-use">Usar como título do corte</button><button class="ap-btn" id="po-new">Gerar de novo</button></div>`, guard(async (mm) => {
        const cur = read(mm); k.post = (await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { post: cur } })).post;
        const all = [cur.title, cur.description, cur.hashtags].filter(Boolean).join('\n\n');
        if (navigator.clipboard) await navigator.clipboard.writeText(all).then(() => toast('Texto copiado.')).catch(() => dl('texto-do-corte.txt', all)); else dl('texto-do-corte.txt', all);
        draw();
      }), 'Copiar tudo', `${tm(k.start)} → ${tm(k.end)} · escrito pela IA a partir da transcrição deste trecho. Revise antes de publicar.`);
      const read = (mm) => ({ title: $('#po-t', mm).value.trim(), description: $('#po-d', mm).value.trim(), hashtags: $('#po-h', mm).value.trim() });
      $('#po-use', m).onclick = guard(async () => { const t = $('#po-t', m).value.trim(); if (!t) return; await api(`/uploads/${c.id}/clips/${k.id}`, { method: 'PATCH', json: { title: t } }); k.title = t; draw(); toast('Título do corte atualizado.'); });
      $('#po-new', m).onclick = guard(async (e) => { const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Escrevendo…'; try { k.post = (await api(`/uploads/${c.id}/clips/${k.id}/ai/post`, { json: {} })).post; $('#po-t', m).value = k.post.title; $('#po-d', m).value = k.post.description; $('#po-h', m).value = (k.post.hashtags || []).join(' '); draw(); } finally { btn.disabled = false; btn.textContent = 'Gerar de novo'; } });
    };
    // A IA falhou nos cortes automáticos: pede de novo e espera o resultado (os cortes criados à mão não são tocados).
    if ($('#ai-retry')) $('#ai-retry').onclick = guard(async (e) => {
      const btn = e.currentTarget, before = c.aiCutsAt || 0; btn.disabled = true; btn.textContent = 'Analisando a pregação…';
      await api(`/uploads/${c.id}/reanalyze`, { json: {} });
      for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 3000)); const m = await api('/uploads/' + c.id); if ((m.aiCutsAt || 0) !== before) return go(location.pathname); }
      btn.disabled = false; btn.textContent = 'Tentar de novo com IA'; toast('A análise está demorando. Recarregue a página em instantes.');
    });
    // Só existe para quem tem a chave do Claude na configuração pessoal.
    if ($('#cl-ai')) $('#cl-ai').onclick = guard(async (e) => {
      const btn = e.currentTarget, label = btn.textContent; btn.disabled = true; btn.textContent = 'Analisando a pregação…';
      try {
        const r = await api(`/uploads/${c.id}/ai/cuts`, { json: { count: 4 } });
        if (r.created.length) { shared.clips.push(...r.created); shared.mode = 0; $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.m === 0)); draw(); }
        toast(!r.created.length ? 'A IA não encontrou outros trechos fortes para sugerir.' : r.created.length === 1 ? '1 corte sugerido pela IA.' : `${r.created.length} cortes sugeridos pela IA.`);
      } finally { btn.disabled = false; btn.textContent = label; }
    });
    // Sincronia da pregação inteira: um ajuste fixo do som que vale para todos os cortes. Pode ser medido sozinho no vídeo todo.
    const syncBtn = $('#cl-sync');
    if (syncBtn) syncBtn.onclick = () => {
      let auto = null;
      const autoOn = !!(S.status && S.status.autosync);
      const m = modal('Sincronia da pregação', `<label for="sy-ms">Ajuste do som (milissegundos)</label><input id="sy-ms" type="number" step="10" min="-5000" max="5000" value="${Math.round((c.audioShift || 0) * 1000)}">
        <p class="sub2" style="margin:6px 0 14px">Positivo atrasa o som (use quando o som vem antes da boca). Negativo adianta (quando o som vem depois). Vale para todos os cortes desta pregação; o ajuste do editor de cada corte soma a este.</p>
        ${autoOn ? '<button class="ap-btn" id="sy-auto" type="button">✨ Detectar no vídeo inteiro</button><p class="sub2" id="sy-msg" role="status" style="margin:10px 0 0"></p>' : '<p class="sub2">Para detectar sozinho, rode uma vez o arquivo <code>install/instalar-autosync</code> e abra o app de novo.</p>'}`,
      guard(async (mm) => {
        const v = Math.max(-5000, Math.min(5000, Math.round(+$('#sy-ms', mm).value || 0))) / 1000;
        const r = await api(`/uploads/${c.id}/sync`, { json: { audioShift: v, auto } });
        c.audioShift = r.audioShift; shared.clips = await api(`/uploads/${c.id}/clips`);
        toast(v ? `Sincronia da pregação: ${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 1000))} ms.${r.resetClips ? ` ${r.resetClips} corte(s) já exportado(s) voltam a ser exportados com o som novo.` : ''}` : 'Sincronia da pregação zerada.');
        window.__render(location.pathname);
      }), 'Salvar', 'Acerta o som com a boca na pregação toda, antes de exportar os cortes.');
      const b = $('#sy-auto', m), msg = $('#sy-msg', m);
      if (b) b.onclick = async () => {
        b.disabled = true; b.textContent = 'Medindo boca e som no vídeo todo… (1 a 2 min)'; msg.textContent = '';
        try {
          const r = await api(`/uploads/${c.id}/autosync`, { json: {} });
          if (r.ok) { auto = { offsetMs: r.offsetMs }; $('#sy-ms', m).value = Math.round(r.shiftSec * 1000); msg.textContent = r.message + (r.needsCorrection ? ` O ajuste ${Math.round(r.shiftSec * 1000) > 0 ? '+' : ''}${Math.round(r.shiftSec * 1000)} ms foi preenchido: clique em Salvar.` : ' Nada a ajustar.'); }
          else msg.textContent = r.message;
        } catch (e) { msg.textContent = e.message; }
        b.disabled = false; b.textContent = '✨ Detectar no vídeo inteiro';
      };
    };
    $('#cl-paste').onclick = () => modal('Colar minutagens', `<label for="cutlist">Uma minutagem por linha</label><textarea id="cutlist" rows="7" placeholder="12:40 - 14:05 O amor de Deus&#10;31:10 - 32:20 O bom pastor"></textarea><div class="cut-rej" hidden></div>`, guard(async (m) => {
      const text = $('#cutlist', m).value; if (!text.trim()) return false;
      const r = await api(`/uploads/${c.id}/clips/bulk`, { json: { text } });
      if (r.created.length) { shared.clips.push(...r.created); shared.mode = 1; $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.m === 1)); draw(); }
      const adj = r.adjusted || [];
      toast(!r.created.length ? 'Nenhuma linha virou corte.' : (r.created.length === 1 ? '1 corte criado.' : `${r.created.length} cortes criados.`) + (adj.length ? (r.created.length === 1 ? ' O fim foi ajustado para o fim do vídeo.' : adj.length === 1 ? ' Um deles teve o fim ajustado para o fim do vídeo.' : ` ${adj.length} tiveram o fim ajustado para o fim do vídeo.`) : ''));
      if (!r.rejected.length) return;
      // Ficam no campo só as linhas recusadas, para corrigir e tentar de novo sem duplicar os cortes já criados.
      $('#cutlist', m).value = r.rejected.map((x) => x.line).join('\n');
      const box = $('.cut-rej', m); box.hidden = false; box.innerHTML = `<b>${r.rejected.length === 1 ? '1 linha não virou corte' : r.rejected.length + ' linhas não viraram corte'}:</b><ul>${r.rejected.map((x) => `<li>${esc(x.line)} — ${esc(x.reason)}</li>`).join('')}</ul>`;
      return false;
    }), 'Criar cortes', 'Cole a lista que o Claude sugeriu. Aceita mm:ss e h:mm:ss, com ou sem título.');
    $('#cl-new').onclick = () => modal('Novo corte', `<label>Título</label><input id="nt" placeholder="Ex.: Minha melhor frase"><label>Início (mm:ss)</label><input id="ns" value="00:00"><label>Fim (mm:ss)</label><input id="ne" value="${tm(Math.min(30, c.duration))}">`, guard(async (m) => { const s = parseT($('#ns', m).value), e = parseT($('#ne', m).value); if (!(e - s >= 3)) { toast('O corte precisa ter ao menos 3s.'); return false; } const k = await api(`/uploads/${c.id}/clips`, { json: { title: $('#nt', m).value.trim() || 'Corte manual', start: s, end: e } }); shared.clips.push(k); shared.mode = 1; $$('#cl-tabs button').forEach((x) => x.setAttribute('aria-selected', +x.dataset.m === 1)); draw(); }), 'Criar corte', 'Informe o intervalo exato do trecho.');

    Object.assign(shared, { driveToken, sendDrive, postModal });
  };
})();
