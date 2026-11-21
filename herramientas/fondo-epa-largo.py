# Fondo de la portada de EPA, más largo SIN más IA (pedido de José, 21/11/2026: "mientras más, mejor").
# Sale de las princesas animadas con IA (5 s, Kling por fal.ai) y del arte de los flyers, en loop sin salto:
#   B  la imagen de las princesas, quieta, con un acercamiento de cámara que termina justo en el primer cuadro del video;
#   A  el video de la IA en cámara lenta (0,5x), con los cuadros intermedios calculados por movimiento (minterpolate);
#   C  la patinadora de celeste frente al castillo (flyer), con un paneo lento;
#   D  la nena que se ata los patines (flyer), con un paneo lento;
# y vuelta a B con fundidos de 1,2 s. Unos 20 s. Dos versiones: compu (1600x986) y celu (720x1280).
# Uso: python herramientas/fondo-epa-largo.py   (ffmpeg en el PATH; unos minutos por la cámara lenta)
import subprocess, os, sys

ORIGEN = r'C:\epa-gala\material'
IA = os.path.join(ORIGEN, 'ia', 'princesas-ia-5s.mp4')            # 1832x1128, 24 fps
CASTILLO = os.path.join(ORIGEN, 'flyers', 'arte-castillo.png')     # 900x680 (flyer "te invita", sin textos)
PATINES = os.path.join(ORIGEN, 'flyers', 'arte-patines.png')       # 900x715 (flyer de la nena, sin textos)
TRABAJO = os.path.join(ORIGEN, 'ia', 'largo')
DESTINO = r'C:\galas-sistema\temas\epa\assets\video'
FPS, LENTO, FUNDIDO = 30, 0.5, 1.2
os.makedirs(TRABAJO, exist_ok=True)

def ff(*args):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-800:])

VERSIONES = {
    # recorte del video de la IA, del castillo y de los patines (x, y, ancho, alto) y el tamaño final
    'compu': dict(W=1600, H=986, ia=None, castillo=(0, 62, 900, 555), patines=(0, 80, 900, 555)),
    'celu':  dict(W=720, H=1280, ia=(599, 0, 634, 1128), castillo=(238, 0, 383, 680), patines=(180, 0, 402, 715)),
}
recorte = lambda c: f'crop={c[2]}:{c[3]}:{c[0]}:{c[1]},' if c else ''
ff('-i', IA, '-frames:v', '1', os.path.join(TRABAJO, 'cuadro0.png'))
for nombre, v in VERSIONES.items():
    W, H = v['W'], v['H']
    t = lambda s: os.path.join(TRABAJO, f'{nombre}-{s}.mp4')
    calidad = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-an']
    print(nombre, '· A: cámara lenta…', flush=True)
    dur_a = 5.0417 / LENTO
    ff('-i', IA, '-vf', f'{recorte(v["ia"])}scale={W}:{H},setpts=PTS/{LENTO},minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',
       '-t', f'{dur_a:.3f}', *calidad, t('A'))
    # zoompan: la imagen se agranda primero (si no, el acercamiento tiembla)
    def kenburns(img, crop, z, x, y, segundos, salida):
        n = int(segundos * FPS)
        ff('-loop', '1', '-i', img, '-vf', f'{recorte(crop)}scale={W*3}:{H*3},zoompan=z=\'{z}\':x=\'{x}\':y=\'{y}\':d={n}:s={W}x{H}:fps={FPS}',
           '-frames:v', str(n), *calidad, salida)
    print(nombre, '· B, C y D…', flush=True)
    kenburns(os.path.join(TRABAJO, 'cuadro0.png'), v['ia'], '1.08-0.08*on/119', 'iw/2-(iw/zoom/2)', 'ih/2-(ih/zoom/2)', 4, t('B'))
    kenburns(CASTILLO, v['castillo'], '1+0.10*on/149', '(iw-iw/zoom)*on/149', 'ih/2-(ih/zoom/2)', 5, t('C'))
    kenburns(PATINES, v['patines'], '1.10-0.10*on/149', '(iw-iw/zoom)*(1-on/149)', 'ih/2-(ih/zoom/2)', 5, t('D'))
    # B + A seguidos (B termina en el primer cuadro de A), fundido a C, a D y de vuelta al principio de B
    ba = 4 + dur_a
    o1 = ba - FUNDIDO
    o2 = ba + 5 - FUNDIDO - FUNDIDO
    total = ba + 5 - FUNDIDO + 5 - FUNDIDO
    o3 = total - FUNDIDO
    filtro = (f'[0:v][1:v]concat=n=2:v=1:a=0,settb=AVTB,fps={FPS}[ba];[2:v]settb=AVTB,fps={FPS}[c];[3:v]settb=AVTB,fps={FPS}[d];'
              f'[4:v]trim=0:{FUNDIDO},setpts=PTS-STARTPTS,settb=AVTB,fps={FPS}[bh];'
              f'[ba][c]xfade=transition=fade:duration={FUNDIDO}:offset={o1:.3f}[x1];'
              f'[x1][d]xfade=transition=fade:duration={FUNDIDO}:offset={o2:.3f}[x2];'
              f'[x2][bh]xfade=transition=fade:duration={FUNDIDO}:offset={o3:.3f},trim={FUNDIDO}:{total:.3f},setpts=PTS-STARTPTS,format=yuv420p[v]')
    final = os.path.join(DESTINO, f'princesas-largo-{nombre}.mp4')
    print(nombre, '· armando el loop…', flush=True)
    ff('-i', t('B'), '-i', t('A'), '-i', t('C'), '-i', t('D'), '-i', t('B'), '-filter_complex', filtro, '-map', '[v]', '-an',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high', '-movflags', '+faststart', final)
    ff('-i', final, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '74', os.path.join(DESTINO, f'princesas-largo-{nombre}.webp'))
    print(nombre, 'listo:', round(os.path.getsize(final) / 1e6, 2), 'MB', flush=True)
