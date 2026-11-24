// Pergunta à OpenAI (ou a um serviço compatível com a API dela) com resposta em JSON no formato de `schema`.
// É a alternativa ao Claude nos recursos de IA: mesma pergunta, mesmo formato de resposta. Ver lib/ai.js.
const fail = (status, message) => Object.assign(new Error(message), { status });

async function askOpenAI({ apiKey, base, model, system, user, schema, fetchImpl = fetch }) {
  let r;
  try {
    r = await fetchImpl(`${String(base || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'resposta', strict: true, schema } },
      }),
    });
  } catch {
    throw fail(502, 'Sem conexão com a API da OpenAI.');
  }
  if (r.status === 401)
    throw fail(401, 'A chave da API da OpenAI foi recusada. Confira OPENAI_API_KEY na sua configuração pessoal.');
  if (r.status === 403) throw fail(403, 'A chave da API da OpenAI não tem permissão para este modelo.');
  if (r.status === 429)
    throw fail(
      429,
      'O limite de uso (ou a cota) da API da OpenAI foi atingido. Espere um pouco ou confira o saldo da conta.',
    );
  if (!r.ok) {
    let detail = '';
    try {
      detail = ((await r.json()).error || {}).message || '';
    } catch {
      /* sem corpo */
    }
    throw fail(502, `A API da OpenAI devolveu um erro (${r.status}). ${String(detail).slice(0, 200)}`);
  }
  const j = await r.json(),
    choice = (j.choices || [])[0] || {},
    msg = choice.message || {};
  if (msg.refusal) throw fail(502, 'A OpenAI recusou analisar este conteúdo.');
  if (choice.finish_reason === 'length') throw fail(502, 'A resposta da OpenAI veio incompleta. Tente de novo.');
  try {
    return JSON.parse(msg.content);
  } catch {
    throw fail(502, 'A OpenAI respondeu em um formato inesperado. Tente de novo.');
  }
}

module.exports = { askOpenAI };
