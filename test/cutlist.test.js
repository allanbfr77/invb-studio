const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCutList, buildPrompt } = require('../lib/cutlist');

const DUR = 5400; // pregação de 1h30

test('lê "12:40 - 14:05 Título"', () => {
  const r = parseCutList('12:40 - 14:05 O amor de Deus', DUR);
  assert.deepEqual(r.cuts, [{ start: 760, end: 845, title: 'O amor de Deus' }]);
  assert.deepEqual(r.rejected, []);
});

test('aceita h:mm:ss', () => {
  assert.deepEqual(parseCutList('1:02:03 - 1:03:10 Tarde', DUR).cuts, [{ start: 3723, end: 3790, title: 'Tarde' }]);
});

for (const [nome, linha] of [
  ['meia-risca', '12:40 – 14:05 Título'],
  ['travessão', '12:40 — 14:05 Título'],
  ['"até"', '12:40 até 14:05 Título'],
  ['"a"', '12:40 a 14:05 Título'],
  ['seta', '12:40 → 14:05 Título'],
  ['marcador "- "', '- 12:40 - 14:05 Título'],
  ['marcador "* "', '* 12:40 - 14:05 Título'],
  ['numeração', '3. 12:40 - 14:05 Título'],
  ['negrito', '**12:40 - 14:05** Título'],
  ['negrito no título', '12:40 - 14:05 **Título**'],
  ['colchetes', '[12:40] - [14:05] Título'],
  ['barra antes do título', '12:40 - 14:05 | Título'],
  ['dois-pontos antes do título', '12:40 - 14:05: Título'],
  ['travessão antes do título', '12:40 - 14:05 - Título'],
]) {
  test(`aceita ${nome}`, () => {
    assert.deepEqual(parseCutList(linha, DUR).cuts, [{ start: 760, end: 845, title: 'Título' }]);
  });
}

test('sem título, numera pela posição', () => {
  const r = parseCutList('00:10 - 00:40\n01:00 - 01:30 Com nome\n02:00 - 02:30', DUR);
  assert.deepEqual(r.cuts.map((c) => c.title), ['Corte 1', 'Com nome', 'Corte 3']);
});

test('linha de texto sem dois tempos é devolvida como rejeitada; linhas em branco são ignoradas', () => {
  const r = parseCutList('Aqui estão as sugestões:\n\n00:10 - 00:40 Um\n\nEspero que ajude às 10:30!', DUR);
  assert.equal(r.cuts.length, 1);
  assert.deepEqual(r.rejected, [
    { line: 'Aqui estão as sugestões:', reason: 'Não encontrei início e fim.' },
    { line: 'Espero que ajude às 10:30!', reason: 'Não encontrei início e fim.' },
  ]);
});

test('rejeita fim antes do início, corte curto e início depois do fim do vídeo, mantendo os válidos', () => {
  const r = parseCutList('14:05 - 12:40 Invertido\n00:10 - 00:12 Curto\n1:40:00 - 1:41:00 Fora\n00:10 - 00:40 Bom', DUR);
  assert.deepEqual(r.cuts, [{ start: 10, end: 40, title: 'Bom' }]);
  assert.deepEqual(r.rejected, [
    { line: '14:05 - 12:40 Invertido', reason: 'O fim vem antes do início.' },
    { line: '00:10 - 00:12 Curto', reason: 'O corte precisa ter ao menos 3 segundos.' },
    { line: '1:40:00 - 1:41:00 Fora', reason: 'O início passa do fim do vídeo.' },
  ]);
});

test('fim depois do fim do vídeo é ajustado para a duração', () => {
  assert.deepEqual(parseCutList('1:29:00 - 1:35:00 Final', DUR).cuts, [{ start: 5340, end: 5400, title: 'Final' }]);
});

test('sem duração conhecida, não limita', () => {
  assert.deepEqual(parseCutList('1:29:00 - 1:35:00 Final', 0).cuts, [{ start: 5340, end: 5700, title: 'Final' }]);
});

test('entrada vazia não cria nada', () => {
  assert.deepEqual(parseCutList('', DUR), { cuts: [], rejected: [] });
  assert.deepEqual(parseCutList(undefined, DUR), { cuts: [], rejected: [] });
});

test('título é limitado a 120 caracteres', () => {
  assert.equal(parseCutList('00:10 - 00:40 ' + 'x'.repeat(300), DUR).cuts[0].title.length, 120);
});

test('buildPrompt traz a instrução, o formato da resposta e cada linha com o tempo', () => {
  const p = buildPrompt('Culto de domingo', [
    { start: 760, text: 'Porque Deus amou o mundo' },
    { start: 3723.4, text: 'mas tenha a vida eterna.' },
  ]);
  const linhas = p.split('\n');
  assert.equal(linhas[0], 'Esta é a transcrição da pregação "Culto de domingo", com o tempo de cada trecho.');
  assert.ok(p.includes('MM:SS - MM:SS Título do corte'));
  assert.ok(p.includes('de 1 a 4 cortes'));
  assert.deepEqual(linhas.slice(-2), ['[12:40] Porque Deus amou o mundo', '[1:02:03] mas tenha a vida eterna.']);
});

test('o que buildPrompt escreve nos tempos é lido de volta por parseCutList', () => {
  const p = buildPrompt('x', [{ start: 3723, text: 'a' }, { start: 3790, text: 'b' }]);
  const [t1, t2] = p.split('\n').slice(-2).map((l) => l.match(/\[(.+?)\]/)[1]);
  assert.deepEqual(parseCutList(`${t1} - ${t2} Volta`, DUR).cuts, [{ start: 3723, end: 3790, title: 'Volta' }]);
});

// --- achados da revisão final ---
test('aceita um rótulo antes dos tempos, como "Corte 2: 10:00 - 11:00 Título"', () => {
  assert.deepEqual(parseCutList('Corte 2: 10:00 - 11:00 A graça', DUR).cuts, [{ start: 600, end: 660, title: 'A graça' }]);
});

test('sem título depois dos tempos, usa o texto que veio antes deles', () => {
  assert.deepEqual(parseCutList('O amor de Deus: 10:00 - 11:00', DUR).cuts, [{ start: 600, end: 660, title: 'O amor de Deus' }]);
  assert.deepEqual(parseCutList('2. 10:00 - 11:00', DUR).cuts, [{ start: 600, end: 660, title: 'Corte 1' }]);
});

test('frase longa antes dos tempos não vira corte', () => {
  const linha = 'Na minha opinião o melhor trecho de toda a pregação fica mais ou menos entre 10:00 - 11:00';
  assert.deepEqual(parseCutList(linha, DUR), { cuts: [], rejected: [{ line: linha, reason: 'Não encontrei início e fim.' }] });
});

test('rejeita segundos ou minutos acima de 59', () => {
  assert.deepEqual(parseCutList('12:75 - 14:05 Errado', DUR).rejected, [{ line: '12:75 - 14:05 Errado', reason: 'Tempo inválido.' }]);
});
