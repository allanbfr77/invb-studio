/* INVB Studio — aba Gastos: quanto o Studio gastou com as APIs no mês (Claude, OpenAI, Groq) e o uso dos serviços
   grátis (Pixabay, Pexels, Freesound, Vercel Blob). Os números são estimados pelo próprio Studio a partir do que cada
   API informa em cada resposta (tokens, segundos de áudio); a fatura oficial fica no painel de cada empresa.
   Dados em /api/usage (lib/usage.js). */
(function () {
  const INVB = window.INVB;
  const { pages, api, esc, toast, $, $$ } = INVB;

  const API_NAMES = {
    claude: ['Claude', 'IA do Studio (cortes, textos, direção de arte)', 'https://console.anthropic.com/usage'],
    openai: ['OpenAI', 'IA ou transcrição pela OpenAI', 'https://platform.openai.com/usage'],
    groq: ['Groq', 'Transcrição e tradução', 'https://console.groq.com/settings/billing'],
    'vercel-blob': ['Vercel Blob', 'Links compartilhados', 'https://vercel.com/dashboard/stores'],
    pixabay: ['Pixabay', 'Imagens de apoio (grátis)', 'https://pixabay.com/api/docs/'],
    pexels: ['Pexels', 'Imagens de apoio (grátis)', 'https://www.pexels.com/api/'],
    freesound: ['Freesound', 'Sons e músicas (grátis)', 'https://freesound.org/home/app_permissions/'],
  };
  const FREE = new Set(['pixabay', 'pexels', 'freesound', 'vercel-blob']);
  const usd = (v) => 'US$ ' + (v > 0 && v < 0.01 ? v.toFixed(4) : (v || 0).toFixed(2)).replace('.', ',');
  const brl = (v, d) => 'R$ ' + (v * d).toFixed(2).replace('.', ',');
  const mb = (b) => (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  const tok = (n) =>
    n >= 1e6 ? (n / 1e6).toFixed(2) + ' mi' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(Math.round(n));
  const monthName = (m) => {
    const [y, mm] = m.split('-');
    return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+mm - 1] + '/' + y;
  };

  pages.gastos = () => '<div class="gs" id="gs"><p class="sub2">Carregando os gastos…</p></div>';

  function view(d) {
    const pct = d.budget ? Math.min(100, (d.total / d.budget) * 100) : 0;
    const apis = Object.entries(d.byApi).sort((a, b) => b[1].cost - a[1].cost);
    const feats = Object.entries(d.byFeature)
      .filter(([, v]) => v.cost > 0 || v.calls)
      .sort((a, b) => b[1].cost - a[1].cost);
    const days = Object.entries(d.days).sort();
    const maxDay = Math.max(0.0001, ...days.map(([, v]) => v));
    const priced = Object.entries(d.prices);
    return `<div class="gs-head"><div><h1>Gastos com as APIs</h1><p class="sub2">Estimativa do Studio a partir do que cada API informa em cada chamada. A fatura oficial está no painel de cada empresa (links abaixo).</p></div>
      <select id="gs-month" aria-label="Mês">${d.months.map((m) => `<option value="${m}" ${m === d.month ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select></div>
      <div class="gs-top">
        <div class="gs-total"><span>Total do mês</span><b>${usd(d.total)}</b><small>≈ ${brl(d.total, d.dollar)} · ${d.calls} chamada${d.calls === 1 ? '' : 's'}</small>
          ${d.budget ? `<div class="gs-bar ${pct >= 90 ? 'hot' : pct >= 70 ? 'warm' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div><small>${pct.toFixed(0)}% do limite de ${usd(d.budget)}${pct >= 90 ? ' — perto do limite!' : ''}</small>` : '<small>Sem limite mensal definido.</small>'}</div>
        <div class="gs-set"><label>Limite por mês (US$)<input type="number" min="0" step="1" id="gs-budget" value="${d.budget || ''}" placeholder="ex.: 20"></label><label>Dólar em reais<input type="number" min="1" step="0.01" id="gs-dollar" value="${d.dollar}"></label><button class="ap-btn" id="gs-save">Salvar</button></div>
      </div>
      <h3 class="gs-h">Por serviço</h3>
      <div class="gs-apis">${
        apis.length
          ? apis
              .map(([k, v]) => {
                const [name, what, url] = API_NAMES[k] || [k, '', ''];
                const detail = FREE.has(k)
                  ? k === 'vercel-blob'
                    ? `${mb(v.bytes)} enviados`
                    : `${v.calls} busca${v.calls === 1 ? '' : 's'}`
                  : [
                      v.inTok ? `${tok(v.inTok)} tokens de entrada` : '',
                      v.outTok ? `${tok(v.outTok)} de saída` : '',
                      v.seconds ? `${Math.round(v.seconds / 60)} min de áudio` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ');
                return `<div class="gs-api"><div><b>${esc(name)}</b><small>${esc(what)}</small></div><strong>${FREE.has(k) ? 'grátis' : usd(v.cost)}</strong><small>${esc(detail)}${v.unknown ? ` · ${v.unknown} sem preço cadastrado` : ''}</small>${url ? `<a href="${url}" target="_blank" rel="noopener">Painel oficial ↗</a>` : ''}</div>`;
              })
              .join('')
          : '<p class="sub2">Nenhum uso registrado neste mês ainda.</p>'
      }</div>
      ${
        days.length
          ? `<h3 class="gs-h">Por dia</h3><div class="gs-days">${days
              .map(
                ([day, v]) =>
                  `<div title="${day.split('-').reverse().join('/')}: ${usd(v)}"><i style="height:${Math.max(2, (v / maxDay) * 100).toFixed(1)}%"></i><span>${+day.slice(8)}</span></div>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        feats.length
          ? `<h3 class="gs-h">Por recurso do Studio</h3><table class="gs-tb"><thead><tr><th>Recurso</th><th>Chamadas</th><th>Custo</th></tr></thead><tbody>${feats
              .map(([k, v]) => `<tr><td>${esc(d.features[k] || k)}</td><td>${v.calls}</td><td>${usd(v.cost)}</td></tr>`)
              .join('')}</tbody></table>`
          : ''
      }
      ${
        d.last.length
          ? `<details class="gs-det"><summary>Últimas chamadas</summary><table class="gs-tb"><thead><tr><th>Quando</th><th>Serviço</th><th>Recurso</th><th>Uso</th><th>Custo</th></tr></thead><tbody>${d.last
              .map(
                (r) =>
                  `<tr><td>${new Date(r.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${esc((API_NAMES[r.api] || [r.api])[0])}</td><td>${esc(d.features[r.feature] || r.feature)}</td><td>${r.inTok ? tok(r.inTok) + ' → ' + tok(r.outTok || 0) + ' tokens' : r.seconds ? Math.round(r.seconds) + ' s de áudio' : r.bytes ? mb(r.bytes) : r.count ? 'busca' : ''}</td><td>${r.cost !== undefined ? usd(r.cost) : FREE.has(r.api) ? 'grátis' : '—'}</td></tr>`,
              )
              .join('')}</tbody></table></details>`
          : ''
      }
      <details class="gs-det"><summary>Preços usados no cálculo</summary><p class="sub2">US$ por milhão de tokens (entrada, saída) ou por hora de áudio. Os do Claude são os oficiais de nov/2026; os outros são estimativas: confira no site de cada empresa e ajuste aqui.</p>
        <table class="gs-tb gs-prices"><thead><tr><th>Modelo</th><th>Entrada</th><th>Saída</th><th>Por hora</th></tr></thead><tbody>${priced
          .map(
            ([m, p]) =>
              `<tr data-m="${esc(m)}"><td>${esc(m)}</td><td><input type="number" step="0.01" min="0" data-k="in" value="${p.in ?? ''}"></td><td><input type="number" step="0.01" min="0" data-k="out" value="${p.out ?? ''}"></td><td><input type="number" step="0.001" min="0" data-k="hour" value="${p.hour ?? ''}"></td></tr>`,
          )
          .join(
            '',
          )}<tr data-m=""><td><input type="text" placeholder="outro modelo" data-k="name"></td><td><input type="number" step="0.01" min="0" data-k="in"></td><td><input type="number" step="0.01" min="0" data-k="out"></td><td><input type="number" step="0.001" min="0" data-k="hour"></td></tr></tbody></table>
        <button class="ap-btn" id="gs-prices">Salvar preços</button><p class="sub2">Preço novo vale para as próximas chamadas; as já registradas guardam o custo da hora em que aconteceram.</p></details>`;
  }

  async function load(month) {
    const el = $('#gs');
    if (!el) return;
    try {
      const d = await api('/usage' + (month ? '?month=' + month : ''));
      el.innerHTML = view(d);
      bind(d);
    } catch (e) {
      el.innerHTML = `<div class="empty"><h3>Não consegui ler os gastos</h3><p>${esc(e.message)}</p></div>`;
    }
  }
  function bind(d) {
    $('#gs-month').onchange = (e) => load(e.target.value);
    $('#gs-save').onclick = async () => {
      try {
        await api('/usage/settings', {
          method: 'PATCH',
          json: { budget: $('#gs-budget').value, dollar: $('#gs-dollar').value },
        });
        toast('Salvo.');
        load(d.month);
      } catch (e) {
        toast(e.message);
      }
    };
    $('#gs-prices').onclick = async () => {
      const prices = {};
      $$('.gs-prices tr[data-m]').forEach((tr) => {
        const name = tr.dataset.m || (tr.querySelector('[data-k="name"]') || {}).value;
        if (!name) return;
        const p = {};
        tr.querySelectorAll('input[type=number]').forEach((i) => {
          if (i.value !== '') p[i.dataset.k] = +i.value;
        });
        prices[name.trim()] = p;
      });
      try {
        await api('/usage/settings', { method: 'PATCH', json: { prices } });
        toast('Preços salvos.');
        load(d.month);
      } catch (e) {
        toast(e.message);
      }
    };
  }
  INVB.bindGastos = () => load();
})();
