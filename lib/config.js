// Configuração: lê o .env e o pessoal.env, as chaves, os serviços de transcrição e de IA, e a versão do app.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pickProvider } = require('./ai');

const ROOT = path.join(__dirname, '..'); // pasta do projeto
// Versão do app neste computador: o código e a data da última atualização (git); sem git, a versão do package.json.
const VERSION = (() => {
  // commit e quando ele foi feito (data e hora): mudam sozinhos a cada atualização do app
  const v = { name: 'v' + require('../package.json').version, commit: '', date: '', at: '' };
  try {
    const o = execFileSync('git', ['log', '-1', '--format=%h|%cs|%cI'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
      windowsHide: true,
    })
      .toString()
      .trim()
      .split('|');
    if (/^[0-9a-f]{6,12}$/.test(o[0] || '')) {
      v.commit = o[0];
      v.date = o[1] || '';
      v.at = o[2] || '';
    }
  } catch {
    /* pasta baixada em ZIP ou sem git: fica a versão do package.json */
  }
  return v;
})();

/* ---------- Configuração (.env opcional) ----------
   install/pessoal.env é a configuração só deste computador (ex.: a chave do Claude). Ela nunca é copiada
   nem compartilhada com a equipe, e vale sobre o .env, que vem do equipe.env de todos. */
for (const envFile of [path.join(ROOT, 'install', 'pessoal.env'), path.join(ROOT, '.env')])
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* sem .env */
  }
const E = process.env;
const cfg = {
  port: +E.PORT || 4321,
  host: E.HOST || (E.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  secureCookies: E.COOKIE_SECURE === '1',
  trustProxy: E.TRUST_PROXY === '1',
  dataDir: path.resolve(E.DATA_DIR || path.join(ROOT, 'data')),
  // Endereço público do Studio (ex.: um túnel da Cloudflare), usado nos links de "Compartilhar" de um corte.
  publicUrl: String(E.PUBLIC_URL || '').replace(/\/+$/, ''),
  // Editor avançado: arquivos exportados do invb-editor (build:studio). INVB_EDITOR_DIR só existe para os testes.
  editorDir: path.resolve(E.INVB_EDITOR_DIR || path.join(ROOT, 'public', 'editor-avancado')),
  python: E.PYTHON || 'python',
  ffmpeg: E.FFMPEG_PATH || '',
  ytdlp: E.YTDLP_PATH || '',
  whisperModel: E.WHISPER_MODEL || 'small',
  whisperDevice: E.WHISPER_DEVICE || 'cpu',
  language: E.TRANSCRIBE_LANGUAGE || 'pt', // português por padrão; TRANSCRIBE_LANGUAGE=auto deixa o serviço adivinhar o idioma
  provider: (E.TRANSCRIBE_PROVIDER || (E.GROQ_API_KEY ? 'groq' : 'openai')).toLowerCase(),
  openaiKey: E.OPENAI_API_KEY || '',
  // Qual IA usar quando houver as duas chaves: 'claude' (padrão) ou 'openai'. 'off' desliga a IA neste computador.
  aiProvider: (E.AI_PROVIDER || '').toLowerCase(),
  openaiBase: (E.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  openaiModel: E.OPENAI_MODEL || 'gpt-4o-mini',
  openaiTranscribeModel: E.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
  googleClientId: E.GOOGLE_CLIENT_ID || '',
  // Recursos de IA com o Claude: só aparecem em quem tem esta chave (na configuração pessoal).
  anthropicKey: E.ANTHROPIC_API_KEY || '',
  // Editor avançado: busca de efeitos sonoros (aba Sons). Chave em https://freesound.org/apiv2/apply
  freesoundKey: E.FREESOUND_API_KEY || '',
  // Pasta compartilhada do Drive onde os cortes prontos ficam disponíveis para a equipe editar.
  driveCutsFolder: /^[\w-]{10,}$/.test(E.DRIVE_CUTS_FOLDER_ID || '') ? E.DRIVE_CUTS_FOLDER_ID : '',
  // Fica salvo só o link: o vídeo original sai do computador depois de N dias sem uso (negativo desliga a limpeza).
  keepOriginalMs:
    (E.KEEP_ORIGINAL_DAYS === undefined || E.KEEP_ORIGINAL_DAYS === '' || isNaN(+E.KEEP_ORIGINAL_DAYS)
      ? 7
      : +E.KEEP_ORIGINAL_DAYS) * 86400000,
  maxUploadBytes: (+E.MAX_UPLOAD_GB || 4) * 1024 ** 3,
};
// Transcrição na nuvem: Groq (Whisper, camada gratuita) ou OpenAI. Ambas usam a mesma API.
const cloud = (p = cfg.provider) =>
  p === 'groq'
    ? {
        name: 'Groq',
        base: 'https://api.groq.com/openai/v1',
        key: E.GROQ_API_KEY || '',
        model: E.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
      }
    : { name: 'OpenAI', base: cfg.openaiBase, key: cfg.openaiKey, model: cfg.openaiTranscribeModel };
const isCloud = (p = cfg.provider) => p === 'groq' || p === 'openai';
/* A tela alterna entre Local (faster-whisper neste computador) e a nuvem (Groq, ou OpenAI se for a configurada).
   A escolha fica em data/settings.json e vale sobre o TRANSCRIBE_PROVIDER do .env. */
const cloudId = isCloud() ? cfg.provider : E.GROQ_API_KEY || !cfg.openaiKey ? 'groq' : 'openai';
const settingsFile = () => path.join(cfg.dataDir, 'settings.json');
const transcribers = () => [
  {
    id: 'local',
    name: 'Local',
    ok: !!tools.whisper,
    model: cfg.whisperModel,
    why: tools.whisper ? null : 'faster-whisper não instalado neste computador.',
  },
  {
    id: cloudId,
    name: cloud(cloudId).name,
    ok: !!cloud(cloudId).key,
    model: cloud(cloudId).model,
    why: cloud(cloudId).key ? null : (cloudId === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY') + ' não configurada.',
  },
];
/* IA dos recursos inteligentes (cortes, texto do corte, capítulos e emoções): Claude ou OpenAI, a que tiver chave.
   Cuidado com quem usa a chave da OpenAI só para transcrever: ali a IA não liga sozinha (seria um gasto novo sem
   ninguém pedir). Para ligar nesse caso, defina AI_PROVIDER=openai. */
const openaiForAI =
  cfg.openaiKey && (cfg.provider !== 'openai' || cfg.aiProvider === 'openai' || E.ANALYSIS_LLM === '1');
const AI = cfg.aiProvider === 'off' ? null : pickProvider({ ...cfg, openaiKey: openaiForAI ? cfg.openaiKey : '' });
// Capítulos e emoções pela IA custam uma chamada a mais por pregação; AI_ANALYSIS=0 deixa só os cortes e o texto.
if (AI && E.AI_ANALYSIS !== '0') {
  cfg.aiAsk = AI.ask;
  cfg.aiLabel = AI.label;
}
const LIB = (...p) => path.join(cfg.dataDir, 'library', ...p);
const IMG_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const rawBody = (req, max) =>
  new Promise((ok, bad) => {
    let n = 0;
    const c = [];
    req.on('data', (d) => {
      n += d.length;
      if (n > max) {
        bad(new Error('Arquivo grande demais (máx. 8 MB).'));
        req.destroy();
      } else c.push(d);
    });
    req.on('end', () => ok(Buffer.concat(c)));
    req.on('error', bad);
  });
const sniffImage = (b) =>
  b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    ? '.png'
    : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
      ? '.jpg'
      : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'
        ? '.webp'
        : null;
const LANGS = {
  Inglês: 'English',
  Espanhol: 'Spanish',
  Francês: 'French',
  Alemão: 'German',
  Italiano: 'Italian',
  Japonês: 'Japanese',
  Coreano: 'Korean',
  Chinês: 'Chinese (Simplified)',
  Russo: 'Russian',
  Português: 'Brazilian Portuguese',
};
async function groqChat(messages) {
  const key = E.GROQ_API_KEY;
  if (!key)
    throw Object.assign(new Error('A tradução precisa de um modelo de linguagem: defina GROQ_API_KEY.'), {
      status: 501,
    });
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: E.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b', temperature: 0.2, messages }),
  });
  if (!r.ok) throw Object.assign(new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 160)}`), { status: 502 });
  return (await r.json()).choices[0].message.content;
}
const U = (...p) => path.join(cfg.dataDir, 'uploads', ...p);
const gb = (n) => (n / 1024 ** 3).toFixed(n < 1024 ** 3 / 10 ? 3 : 1).replace('.', ',') + ' GB';
/** Mensagem de arquivo acima do limite: diz o tamanho (quando conhecido), o limite e onde aumentar. */
const tooBig = (size) =>
  `Arquivo grande demais${size ? ' (' + gb(size) + ')' : ''}: o limite atual é de ${gb(cfg.maxUploadBytes)}. Para aumentar, defina MAX_UPLOAD_GB no arquivo de configuração (equipe.env) e abra o app de novo.`;
const manualClip = (title, start, end) => ({
  id: 'm' + crypto.randomBytes(6).toString('hex'),
  title: String(title || 'Corte manual').slice(0, 120),
  description: 'Corte criado manualmente.',
  tags: ['Manual'],
  score: 0,
  type: 'Manual',
  start,
  end,
  emotion: null,
  fav: false,
  hid: false,
  manual: true,
  downloaded: false,
  render: null,
});
const tools = { ffmpeg: null, whisper: false, ytdlp: null, checked: false };

module.exports = {
  VERSION,
  ROOT,
  E,
  cfg,
  cloud,
  isCloud,
  cloudId,
  settingsFile,
  transcribers,
  AI,
  LIB,
  IMG_EXT,
  rawBody,
  sniffImage,
  LANGS,
  groqChat,
  U,
  tooBig,
  manualClip,
  tools,
};
