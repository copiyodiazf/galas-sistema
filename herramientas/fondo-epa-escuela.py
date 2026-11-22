# Fondo de la sección de la escuela de EPA ("3 sedes, una sola pasión"), más largo y sin IA (José, 22/11/2026: el de 4 s
# era muy corto). Tres tomas reales del show 2025 en el Estadio Arena, en loop sin salto:
#   G  todas juntas frente al cartel "ARENA · VILLA CARLOS PAZ", en cámara lenta (0,5x, cuadros intermedios por movimiento);
#   R  la ronda de patinadoras de la mano, con el cubo del Arena arriba;
#   T  la tribuna llena;
# y vuelta a G con fundidos de 1 s. Unos 17 s, vertical (576x1024, como los originales del celular).
# Uso: python herramientas/fondo-epa-escuela.py   (ffmpeg en el PATH)
import subprocess, os, sys

ORIGEN = r'C:\epa-gala\material\whatsapp'
DESTINO = r'C:\galas-sistema\temas\epa\assets\video'
TRABAJO = r'C:\epa-gala\material\ia\escuela'
FPS, FUNDIDO = 30, 1.0
os.makedirs(TRABAJO, exist_ok=True)

def ff(*args):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-800:])

base = f'scale=576:1024:force_original_aspect_ratio=increase,crop=576:1024,setsar=1,eq=saturation=1.08'
calidad = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-an']
t = lambda s: os.path.join(TRABAJO, f'{s}.mp4')
print('G: cámara lenta…', flush=True)
ff('-i', os.path.join(ORIGEN, '14-video.mp4'), '-vf', f'{base},setpts=PTS/0.5,minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1', *calidad, t('G'))
ff('-ss', '0.5', '-t', '6.1', '-i', os.path.join(ORIGEN, '15-video.mp4'), '-vf', f'{base},fps={FPS}', *calidad, t('R'))
ff('-t', '5.2', '-i', os.path.join(ORIGEN, '11-video.mp4'), '-vf', f'{base},fps={FPS}', *calidad, t('T'))
dur = lambda f: float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
g, r, tr = dur(t('G')), dur(t('R')), dur(t('T'))
o1 = g - FUNDIDO
o2 = g + r - 2 * FUNDIDO
total = g + r + tr - 2 * FUNDIDO
o3 = total - FUNDIDO
filtro = (f'[0:v]settb=AVTB[g];[1:v]settb=AVTB[r];[2:v]settb=AVTB[t];[3:v]trim=0:{FUNDIDO},setpts=PTS-STARTPTS,settb=AVTB[gh];'
          f'[g][r]xfade=transition=fade:duration={FUNDIDO}:offset={o1:.3f}[x1];'
          f'[x1][t]xfade=transition=fade:duration={FUNDIDO}:offset={o2:.3f}[x2];'
          f'[x2][gh]xfade=transition=fade:duration={FUNDIDO}:offset={o3:.3f},trim={FUNDIDO}:{total:.3f},setpts=PTS-STARTPTS,format=yuv420p[v]')
final = os.path.join(DESTINO, 'escuela-fondo.mp4')
print('armando el loop…', flush=True)
ff('-i', t('G'), '-i', t('R'), '-i', t('T'), '-i', t('G'), '-filter_complex', filtro, '-map', '[v]', '-an',
   '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-profile:v', 'high', '-movflags', '+faststart', final)
ff('-i', final, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '72', os.path.join(DESTINO, 'escuela-fondo.webp'))
print(f'listo: {dur(final):.1f} s · {os.path.getsize(final) / 1e6:.2f} MB', flush=True)
