const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanVoice } = require('../lib/voice');

test('remover música: só existe ligado ("ia") ou desligado', () => {
  assert.equal(cleanVoice('ia'), 'ia');
  assert.equal(cleanVoice('off'), 'off'); assert.equal(cleanVoice(undefined), 'off'); assert.equal(cleanVoice('qualquer'), 'off');
  // os níveis antigos de redução de ruído foram retirados: um pedido antigo com eles exporta o áudio original
  assert.equal(cleanVoice('leve'), 'off'); assert.equal(cleanVoice('forte'), 'off'); assert.equal(cleanVoice(true), 'off');
});
