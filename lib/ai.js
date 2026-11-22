// Qual IA atende os recursos de IA deste computador: Claude ou OpenAI, conforme a chave que existir.
// Os recursos (sugerir cortes, texto do corte, capítulos e emoções) fazem a mesma pergunta às duas, pelo `ask`.
const { askClaude, claudeAvailable, MODEL } = require('./claude');
const { askOpenAI } = require('./openai');

/**
 * Devolve { name, label, ask } da IA ativa, ou null se não houver chave nenhuma.
 * Com as duas chaves, vale o Claude, a menos que AI_PROVIDER diga "openai". Pedir uma IA sem chave cai na outra.
 */
function pickProvider(cfg) {
  const claude = claudeAvailable(cfg.anthropicKey) ? { name: 'claude', label: 'Claude Opus 5.5', ask: (q) => askClaude({ apiKey: cfg.anthropicKey, ...q }) } : null;
  const openai = cfg.openaiKey ? { name: 'openai', label: `OpenAI ${cfg.openaiModel}`, ask: (q) => askOpenAI({ apiKey: cfg.openaiKey, base: cfg.openaiBase, model: cfg.openaiModel, ...q }) } : null;
  const want = String(cfg.aiProvider || '').toLowerCase();
  if (want === 'openai') return openai || claude;
  return claude || openai;
}

module.exports = { pickProvider, MODEL };
