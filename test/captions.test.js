const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CS = require('../public/caption-styles.js');

// dez palavras seguidas, na mesma fala, uma a cada 0,4 s
const words = 'Deus prefere um vaso quebrado e sincero a um fingido'
  .split(' ')
  .map((t, i) => ({ t, s: i * 0.4, e: i * 0.4 + 0.35, seg: 0 }));
const sizes = (style) => CS.chunkWords(words, style).map((c) => c.length);

test('o catálogo é curto, com nomes únicos, e todas as fontes existem em public/fonts', () => {
  assert.ok(CS.STYLES.length >= 10 && CS.STYLES.length <= 30, 'catálogo enxuto');
  assert.equal(new Set(CS.STYLES.map((s) => s.id)).size, CS.STYLES.length);
  for (const s of CS.STYLES) assert.ok(CS.FONTS.includes(s.font), s.id + ': fonte ' + s.font);
  for (const f of CS.FONT_LIST) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'fonts', f.file)), f.file);
    if (f.italic) assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'fonts', f.italic)), f.italic);
  }
});

test('o estilo que vale é o escolhido com as mudanças por cima', () => {
  const s = CS.resolve({
    style: 'Destaque/Destaque dourado',
    font: 'Anton',
    color: '#ABCDEF',
    box: { color: '#000000', alpha: 0.3 },
  });
  assert.equal(s.font, 'Anton');
  assert.equal(s.color, '#abcdef');
  assert.deepEqual(s.box, { color: '#000000', alpha: 0.3 });
  assert.equal(s.mode, 'highlight'); // o resto vem do estilo
  assert.equal(CS.resolve({ style: 'Com fundo/Faixa escura', box: false }).box, null); // false tira o fundo do estilo
});

test('valores inválidos ficam de fora e não quebram nada', () => {
  const s = CS.resolve({
    style: 'nao-existe',
    font: 'Comic Sans',
    color: 'vermelho',
    ow: 99,
    mode: 'dança',
    box: { color: 'x' },
  });
  assert.equal(s.id, CS.DEFAULT_ID);
  assert.equal(s.font, CS.DEFAULT_FONT); // fonte desconhecida vira a padrão
  assert.equal(s.color, '#ffffff');
  assert.equal(CS.cleanProps({ ow: 99 }).ow, 10);
  assert.equal(s.mode, CS.byName(CS.DEFAULT_ID).mode);
  assert.equal(s.box, null);
});

test('edições antigas continuam abrindo: o padrão de antes era a frase inteira, e as fontes antigas viram a padrão', () => {
  const s = CS.resolve({ style: 'Clássicos/Clássica', font: 'DejaVu Sans', upper: null, ow: null, words: null });
  assert.equal(s.id, 'Essenciais/Frase inteira');
  assert.equal(s.mode, 'block');
  assert.equal(s.font, CS.DEFAULT_FONT);
  assert.equal(CS.cleanProps({ mode: 'words2' }).mode, 'highlight');
});

test('palavras de cada vez: o número escolhido vale, e pausas longas ou troca de fala ainda quebram', () => {
  assert.deepEqual(sizes(CS.resolve({ words: 3 })), [3, 3, 3, 1]);
  assert.deepEqual(sizes(CS.resolve({ chunk: 5 })), [5, 5]);
  assert.deepEqual(sizes(CS.resolve({ mode: 'words1', words: 4 })), new Array(10).fill(1)); // uma por vez é sempre uma
  assert.equal(CS.resolve({ style: 'Essenciais/Frase inteira', words: 4 }).mode, 'plain'); // frase inteira com número vira grupo
  const w = words.map((x, i) => (i >= 4 ? { ...x, s: x.s + 2, e: x.e + 2 } : x));
  assert.deepEqual(
    CS.chunkWords(w, CS.resolve({ words: 6 })).map((c) => c.length),
    [4, 6],
  );
});

test('estilo salvo: guarda só o que mudou e volta igual', () => {
  const cap = { style: 'Destaque/Karaokê', font: 'Anton', hi: '#22c55e', ow: 4 };
  const full = CS.resolve(cap);
  const props = CS.diff(full, cap.style);
  assert.deepEqual(props, { font: 'Anton', hi: '#22c55e' }); // ow 4 já é o do Karaokê
  const back = CS.resolve(CS.fromSaved({ id: 'a1', base: cap.style, props, size: 20, pos: 'top', margin: 12 }));
  for (const k of CS.KEYS) assert.deepEqual(back[k], full[k], k);
  const c = CS.fromSaved({ id: 'a1', base: cap.style, props, size: 20, pos: 'top', margin: 12 });
  assert.equal(c.size, 20);
  assert.equal(c.pos, 'top');
  assert.equal(c.mine, 'a1');
  // tirar o fundo de um estilo que tem fundo também fica guardado
  assert.deepEqual(CS.diff(CS.resolve({ style: 'Com fundo/Faixa escura', box: false }), 'Com fundo/Faixa escura'), {
    box: false,
  });
});

test('efeitos novos: entrada, palavra que cresce, palavras-chave e surgindo', () => {
  assert.equal(CS.resolve({ pop: true }).anim, 'pop'); // edições antigas com "pop" ligado
  assert.equal(CS.resolve({ pop: false, style: 'Impacto/Uma palavra' }).anim, 'none');
  assert.equal(CS.resolve({ anim: 'dança' }).anim, 'none'); // valor desconhecido fica de fora
  assert.equal(CS.resolve({ anim: 'slide' }).anim, 'slide');
  assert.ok(CS.isKeyword('Deus,') && CS.isKeyword('FÉ!') && CS.isKeyword('graça'));
  assert.ok(!CS.isKeyword('casa'));
  const s = CS.resolve({ style: 'Destaque/Surgindo' });
  assert.equal(s.mode, 'reveal');
  assert.equal(s.kw, true);
  assert.equal(CS.cleanProps({ kc: '#ABCDEF', grow: 'sim' }).kc, '#abcdef');
  assert.equal(CS.cleanProps({ grow: 'sim' }).grow, undefined); // só true/false
});
