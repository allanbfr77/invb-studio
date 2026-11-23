#!/usr/bin/env python3
"""AutoSync: mede o atraso entre a fala e os lábios de um vídeo com o SyncNet. Uso:
  python autosync.py <video> --out <saida.json> --ffmpeg <ffmpeg> [--start S] [--end E] [--max-shift-ms 1000]
  python autosync.py --check          (confere bibliotecas e modelos; sai com código 0 se estiver tudo certo)
  python autosync.py --install-models (baixa os dois modelos e confere a assinatura SHA-256 de cada um)

Só mede: escolhe janelas curtas espalhadas pelo trecho, acha o rosto em cada uma, e compara o movimento da boca com
o som em vários deslocamentos de 40 ms (1 quadro a 25 fps). A decisão (corrigir ou não) fica em lib/autosync.js.
Imprime linhas JSON de progresso no stdout: {"type":"progress","pct":N}. O resultado vai para --out.
Convenção: lag_ms > 0 quer dizer som ATRASADO em relação à boca; lag_ms < 0, som ADIANTADO."""
import argparse, hashlib, json, math, os, re, subprocess, sys

FPS = 25
CROP = 224
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.environ.get('AUTOSYNC_MODELS') or os.path.join(HERE, '..', 'models', 'autosync')
# Os pesos são conferidos antes de carregar: um arquivo trocado ou corrompido não chega a ser lido.
FILES = {
    'syncnet_v2.model': '961e8696f888fce4f3f3a6c3d5b3267cf5b343100b238e79b2659bff2c605442',
    'face_detection_yunet_2023mar.onnx': '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
}
# De onde baixar. O primeiro endereço que entregar o arquivo com a assinatura certa vale; os outros ficam de reserva.
# syncnet_v2.model: pesos publicados pelos autores do SyncNet (Universidade de Oxford, VGG). A cópia do Hugging Face
# (repositório ByteDance/LatentSync, que usa o mesmo arquivo para avaliação) é idêntica byte a byte e bem mais rápida.
# face_detection_yunet_2023mar.onnx: detector de rosto YuNet, do OpenCV Zoo (licença MIT).
URLS = {
    'syncnet_v2.model': [
        'https://huggingface.co/ByteDance/LatentSync/resolve/main/auxiliary/syncnet_v2.model',
        'https://www.robots.ox.ac.uk/~vgg/software/lipsync/data/syncnet_v2.model',
    ],
    'face_detection_yunet_2023mar.onnx': [
        'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
    ],
}


def emit(**o):
    print(json.dumps(o), flush=True)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def check_models():
    for name, want in FILES.items():
        p = os.path.join(MODELS, name)
        if not os.path.isfile(p):
            raise RuntimeError(f'Falta o modelo {name}. Rode o instalador da sincronia automática.')
        if sha256(p) != want:
            raise RuntimeError(f'O modelo {name} não confere (arquivo corrompido ou trocado). Rode o instalador de novo.')


def install_models():
    import urllib.request
    os.makedirs(MODELS, exist_ok=True)
    for name, want in FILES.items():
        dst = os.path.join(MODELS, name)
        if os.path.isfile(dst) and sha256(dst) == want:
            print(f'{name}: já instalado.', flush=True)
            continue
        ok = False
        for url in URLS[name]:
            tmp = dst + '.baixando'
            try:
                print(f'Baixando {name}...', flush=True)
                with urllib.request.urlopen(url, timeout=60) as r, open(tmp, 'wb') as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                if sha256(tmp) != want:
                    print(f'  O arquivo de {url} não confere com a assinatura esperada; descartado.', flush=True)
                    os.remove(tmp)
                    continue
                os.replace(tmp, dst)
                ok = True
                break
            except Exception as e:  # noqa
                print(f'  Falhou ({e}); tentando outro endereço.', flush=True)
                if os.path.exists(tmp):
                    os.remove(tmp)
        if not ok:
            raise RuntimeError(f'Não consegui baixar o modelo {name}. Confira a internet e rode o instalador de novo.')


def probe(ffmpeg, video):
    r = subprocess.run([ffmpeg, '-hide_banner', '-i', video], capture_output=True, text=True, errors='replace')
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)', r.stderr)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
    v = re.search(r'Stream #[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b', r.stderr)
    a = re.search(r'Stream #[^\n]*Audio:', r.stderr)
    return dur, (int(v.group(1)), int(v.group(2))) if v else None, bool(a)


def even(x):
    return max(2, int(round(x / 2)) * 2)


def read_frames(ffmpeg, video, t0, dur, size):
    """Quadros a 25 fps, BGR, no tamanho pedido. Um por vez, para não guardar o vídeo inteiro na memória."""
    import numpy as np
    w, h = size
    cmd = [ffmpeg, '-v', 'error', '-ss', f'{t0:.3f}', '-i', video, '-t', f'{dur:.3f}', '-an', '-sn',
           '-vf', f'fps={FPS},scale={w}:{h}', '-pix_fmt', 'bgr24', '-f', 'rawvideo', 'pipe:1']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = w * h * 3
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            yield np.frombuffer(b, dtype=np.uint8).reshape(h, w, 3)
    finally:
        p.stdout.close()
        p.wait()


def read_audio(ffmpeg, video, t0, dur):
    import numpy as np
    cmd = [ffmpeg, '-v', 'error', '-ss', f'{t0:.3f}', '-i', video, '-t', f'{dur:.3f}', '-vn', '-ac', '1', '-ar', '16000',
           '-f', 's16le', 'pipe:1']
    r = subprocess.run(cmd, capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.int16)


def iou(a, b):
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    i = max(0, x2 - x1) * max(0, y2 - y1)
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i
    return i / u if u > 0 else 0


def face_tracks(dets, n, gap=10, min_len=2 * FPS):
    """Liga as detecções de quadro em quadro (sobreposição da caixa). Buracos curtos são preenchidos por interpolação."""
    import numpy as np
    tracks = []
    for f in range(n):
        used = set()
        for d in sorted(dets[f], key=lambda d: -d[4]):
            best, bi = 0.3, None
            for k, t in enumerate(tracks):
                if k in used or f - t['f'][-1] > gap or t['f'][-1] == f:
                    continue
                o = iou(t['b'][-1], d)
                if o > best:
                    best, bi = o, k
            if bi is None:
                tracks.append({'f': [f], 'b': [d[:4]]})
                used.add(len(tracks) - 1)
            else:
                tracks[bi]['f'].append(f)
                tracks[bi]['b'].append(d[:4])
                used.add(bi)
    out = []
    for t in tracks:
        f0, f1 = t['f'][0], t['f'][-1]
        span = f1 - f0 + 1
        if span < min_len or len(t['f']) < 0.7 * span:
            continue
        fr = np.arange(f0, f1 + 1)
        b = np.array(t['b'], dtype=np.float64)
        boxes = np.stack([np.interp(fr, t['f'], b[:, j]) for j in range(4)], 1)
        out.append({'f0': int(f0), 'f1': int(f1), 'boxes': boxes})
    out.sort(key=lambda t: -float(np.mean(t['boxes'][:, 3] - t['boxes'][:, 1])) * (t['f1'] - t['f0']))
    return out


def crop_face(frame, box, scale_x, scale_y, cs=0.4):
    """Recorte do rosto igual ao do SyncNet original (run_pipeline.py, crop_video): a boca fica na metade de baixo."""
    import cv2, numpy as np
    x1, y1, x2, y2 = box[0] * scale_x, box[1] * scale_y, box[2] * scale_x, box[3] * scale_y
    bs = max(y2 - y1, x2 - x1) / 2
    bsi = int(bs * (1 + 2 * cs))
    pad = np.pad(frame, ((bsi, bsi), (bsi, bsi), (0, 0)), 'constant', constant_values=110)
    my, mx = (y1 + y2) / 2 + bsi, (x1 + x2) / 2 + bsi
    face = pad[int(my - bs):int(my + bs * (1 + 2 * cs)), int(mx - bs * (1 + cs)):int(mx + bs * (1 + cs))]
    return cv2.resize(face, (CROP, CROP))


def medfilt(x, k=13):
    from scipy.signal import medfilt as mf
    return mf(x, kernel_size=k) if len(x) >= k else x


def lag_curve(net, crops, mfcc, margin, torch, stride=2, batch=32):
    """Distância média entre boca e som para cada deslocamento de -margin a +margin quadros."""
    import numpy as np
    n = len(crops)
    if n < 5 + 2:
        return None
    im = torch.from_numpy(np.stack(crops, 0).astype(np.float32)).permute(3, 0, 1, 2)  # 3 x T x H x W
    idx = list(range(0, n - 4, stride))
    vfeat = []
    with torch.no_grad():
        for i in range(0, len(idx), batch):
            b = torch.stack([im[:, j:j + 5] for j in idx[i:i + batch]], 0)
            vfeat.append(net.forward_lip(b))
        vfeat = torch.cat(vfeat, 0)
        # Áudio: 4 passos de MFCC (10 ms) por quadro, janela de 20 passos (0,2 s) para cada grupo de 5 quadros.
        na = (mfcc.shape[1] - 20) // 4 + 1
        cct = torch.from_numpy(mfcc.astype(np.float32))[None, None]
        afeat = []
        for i in range(0, na, batch):
            b = torch.cat([cct[:, :, :, 4 * j:4 * j + 20] for j in range(i, min(na, i + batch))], 0)
            afeat.append(net.forward_aud(b))
        afeat = torch.cat(afeat, 0)
    ks = list(range(-margin, margin + 1))
    curve = []
    for k in ks:
        js = [j + margin + k for j in idx]
        ok = [p for p, j in enumerate(js) if 0 <= j < len(afeat)]
        if len(ok) < 0.9 * len(idx):
            return None
        d = torch.nn.functional.pairwise_distance(vfeat[ok], afeat[[js[p] for p in ok]])
        curve.append(float(d.mean()))
    return np.array(curve)


def summarize(curve, margin):
    import numpy as np
    k = int(np.argmin(curve))
    mn, med = float(curve[k]), float(np.median(curve))
    # Refinamento abaixo de 1 quadro: parábola pelos três pontos em volta do mínimo.
    sub = 0.0
    if 0 < k < len(curve) - 1:
        a, b, c = curve[k - 1], curve[k], curve[k + 1]
        den = a - 2 * b + c
        if den > 1e-9:
            sub = float(np.clip(0.5 * (a - c) / den, -0.5, 0.5))
    far = [curve[j] for j in range(len(curve)) if abs(j - k) > 2]
    return {
        'lag_frames': k - margin,
        'lag_ms': round((k - margin + sub) * 1000 / FPS, 1),
        'conf': round(med - mn, 3),
        'gap': round(float(min(far)) - mn, 3) if far else 0.0,
        'edge': k in (0, len(curve) - 1),
        'min_dist': round(mn, 3),
    }


def analyze_window(ctx, t0, dur):
    import numpy as np, python_speech_features
    ffmpeg, video, det, net, torch, margin = ctx['ffmpeg'], ctx['video'], ctx['det'], ctx['net'], ctx['torch'], ctx['margin']
    W, H = ctx['src']
    # Detecção de rosto numa cópia reduzida (rápido); o recorte vem de uma leitura em até 720p (mais nítido).
    dw = min(W, 640); dh = even(H * dw / W); dw = even(dw)
    cw = min(W, even(W * 720 / H)) if H > 720 else W; ch = even(H * cw / W); cw = even(cw)
    det.setInputSize((dw, dh))
    dets = []
    for fr in read_frames(ffmpeg, video, t0, dur, (dw, dh)):
        _, faces = det.detect(fr)
        ds = []
        if faces is not None:
            for f in faces:
                x, y, w, h, s = float(f[0]), float(f[1]), float(f[2]), float(f[3]), float(f[14])
                if w * h > 0:
                    ds.append((x, y, x + w, y + h, s))
        dets.append(ds)
    n = len(dets)
    out = {'t': round(t0, 2), 'dur': round(dur, 2), 'frames': n, 'faces': max((len(d) for d in dets), default=0)}
    audio = read_audio(ffmpeg, video, t0 - margin / FPS, dur + 2 * margin / FPS + 0.2)
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))) if len(audio) else 0.0
    out['rms_db'] = round(20 * math.log10(rms / 32768) if rms > 0 else -120.0, 1)
    if len(audio):
        blk = audio[: len(audio) // 1600 * 1600].astype(np.float64).reshape(-1, 1600)  # blocos de 0,1 s
        b = np.sqrt(np.mean(blk ** 2, 1)) + 1e-9
        db = 20 * np.log10(b / 32768)
        out['active'] = round(float(np.mean(db > max(-50.0, float(np.percentile(db, 10)) + 12))), 2)
    else:
        out['active'] = 0.0
    if n < 2 * FPS:
        out['reason'] = 'curto'
        return out
    tracks = face_tracks(dets, n)
    if not tracks:
        out['reason'] = 'sem_rosto'
        return out
    if out['rms_db'] < -55 or out['active'] < 0.2:
        out['reason'] = 'sem_fala'
        return out
    tracks = tracks[:3]
    for t in tracks:
        hgt = (t['boxes'][:, 3] - t['boxes'][:, 1]) * ch / dh
        t['px'] = round(float(np.median(hgt)))
        for j in range(4):
            t['boxes'][:, j] = medfilt(t['boxes'][:, j])
        t['crops'] = []
    sx, sy = cw / dw, ch / dh
    for i, fr in enumerate(read_frames(ffmpeg, video, t0, dur, (cw, ch))):
        for t in tracks:
            if t['f0'] <= i <= t['f1']:
                t['crops'].append(crop_face(fr, t['boxes'][i - t['f0']], sx, sy))
    mf = python_speech_features.mfcc(audio, 16000).T  # 13 x passos de 10 ms
    res = []
    for t in tracks:
        if t['px'] < 40:
            res.append({'px': t['px'], 'reason': 'rosto_pequeno'})
            continue
        # O áudio lido começa margin quadros antes da janela; o rosto pode começar depois do início dela.
        a0 = t['f0'] * 4
        sub = mf[:, a0: a0 + (len(t['crops']) + 2 * margin) * 4 + 20]
        curve = lag_curve(net, t['crops'], sub, margin, torch)
        if curve is None:
            res.append({'px': t['px'], 'reason': 'curto'})
            continue
        r = summarize(curve, margin)
        r.update({'px': t['px'], 'frames': len(t['crops'])})
        res.append(r)
    out['tracks'] = res
    good = [r for r in res if 'conf' in r]
    if not good:
        out['reason'] = res[0].get('reason', 'sem_rosto') if res else 'sem_rosto'
        return out
    best = max(good, key=lambda r: r['conf'])
    out.update({k: best[k] for k in ('lag_frames', 'lag_ms', 'conf', 'gap', 'edge', 'min_dist', 'px')})
    return out


def windows(start, end, max_n=10, length=8.0):
    span = end - start
    if span <= 0:
        return []
    if span < 2 * length:
        # Trecho curto (um corte): duas janelas que dividem o trecho, ou uma só se ele for curto demais.
        if span < 6:
            return [(start, span)]
        h = span / 2
        return [(start, h), (start + h, h)]
    n = min(max_n, int(span // length))
    step = (span - length) / (n - 1) if n > 1 else 0
    ws = [(start + i * step, length) for i in range(n)]
    # Ordem que espalha logo de início (começo, fim, meio, quartos...), para parar cedo se já houver janelas suficientes.
    order, seen, parts = [], set(), [(0, n - 1)]
    for i in (0, n - 1):
        if i not in seen:
            seen.add(i); order.append(i)
    while parts:
        nxt = []
        for lo, hi in parts:
            if hi - lo < 2:
                continue
            mid = (lo + hi) // 2
            if mid not in seen:
                seen.add(mid); order.append(mid)
            nxt += [(lo, mid), (mid, hi)]
        parts = nxt
    order += [i for i in range(n) if i not in seen]
    return [ws[i] for i in order]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video', nargs='?')
    ap.add_argument('--out')
    ap.add_argument('--ffmpeg', default='ffmpeg')
    ap.add_argument('--start', type=float, default=0)
    ap.add_argument('--end', type=float, default=0)
    ap.add_argument('--max-shift-ms', type=float, default=2000)
    ap.add_argument('--max-windows', type=int, default=10)
    ap.add_argument('--enough', type=int, default=6, help='para depois de tantas janelas com resultado')
    ap.add_argument('--min-conf', type=float, default=3.5, help='confiança mínima para a janela contar como resultado')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--install-models', action='store_true')
    a = ap.parse_args()
    if a.install_models:
        try:
            install_models()
        except Exception as e:  # noqa
            print(str(e), flush=True)
            sys.exit(1)
        return
    # A conferência rápida (--check, feita a cada início do app) só procura as bibliotecas, sem carregá-las.
    import importlib.util
    miss = [m for m in ('numpy', 'scipy', 'cv2', 'torch', 'python_speech_features') if importlib.util.find_spec(m) is None]
    if miss:
        emit(type='error', message='Biblioteca ausente: ' + ', '.join(miss) + '. Rode o instalador da sincronia automática.')
        sys.exit(2)
    try:
        check_models()
    except Exception as e:  # noqa
        emit(type='error', message=str(e))
        sys.exit(2)
    if a.check:
        emit(type='ok')
        return
    try:
        import cv2, torch
        from syncnet_model import SyncNet
    except Exception as e:  # noqa
        emit(type='error', message=f'Não consegui carregar as bibliotecas da sincronia automática ({e}). Rode o instalador de novo.')
        sys.exit(2)
    torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))
    dur, src, has_audio = probe(a.ffmpeg, a.video)
    if not dur:
        emit(type='error', message='Não consegui ler este vídeo.')
        sys.exit(3)
    if not src:
        emit(type='error', message='O arquivo não tem imagem: não há boca para comparar com o som.')
        sys.exit(3)
    if not has_audio:
        emit(type='error', message='O arquivo não tem som.')
        sys.exit(3)
    margin = max(2, int(round(a.max_shift_ms * FPS / 1000)))
    mt = margin / FPS
    # As janelas precisam de som sobrando dos dois lados para testar os deslocamentos.
    start = max(a.start, mt)
    end = min(a.end if a.end > 0 else dur, dur - mt - 0.3)
    ws = windows(start, end, a.max_windows)
    if not ws or end - start < 3:
        emit(type='error', message='Trecho curto demais para medir a sincronia (mínimo de 3 segundos com fala).')
        sys.exit(3)
    net = SyncNet()
    state = torch.load(os.path.join(MODELS, 'syncnet_v2.model'), map_location='cpu', weights_only=True)
    net.load_state_dict(state)
    net.eval()
    det = cv2.FaceDetectorYN.create(os.path.join(MODELS, 'face_detection_yunet_2023mar.onnx'), '', (320, 320), 0.7, 0.3, 50)
    ctx = {'ffmpeg': a.ffmpeg, 'video': a.video, 'det': det, 'net': net, 'torch': torch, 'margin': margin, 'src': src}
    res = []
    for i, (t0, d) in enumerate(ws):
        try:
            r = analyze_window(ctx, t0, d)
        except Exception as e:  # noqa
            r = {'t': round(t0, 2), 'dur': round(d, 2), 'reason': 'erro', 'error': str(e)[:200]}
        res.append(r)
        emit(type='progress', pct=round(100 * (i + 1) / len(ws)))
        if sum(1 for x in res if 'conf' in x and x['conf'] >= a.min_conf) >= a.enough:
            break
    out = {'duration': round(dur, 2), 'size': list(src), 'fps': FPS, 'maxShiftMs': margin * 1000 / FPS,
           'range': [round(start, 2), round(end, 2)], 'windows': sorted(res, key=lambda r: r['t'])}
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(out, f)
    emit(type='done')


if __name__ == '__main__':
    main()
