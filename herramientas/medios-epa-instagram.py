# Medios de la página de EPA sacados de su Instagram (bajado con gallery-dl el 22/11/2026, C:\epa-gala\material\instagram-gdl):
#  - el video del show 2025 (24/12/2025, 720x1280, 92 s): seis tomas para el carrusel 3D y un fondo de ~20 s para la sección;
#  - fotos de las patinadoras en torneos y entrenamientos 2025-2026 para la galería (sin nombres).
# Uso: python herramientas/medios-epa-instagram.py [--solo-galeria]   (ffmpeg en el PATH, Pillow)
import subprocess, os, sys
from PIL import Image

IG = r'C:\epa-gala\material\instagram-gdl\instagram\epa_escuela_de_patin_artistico'
SHOW = os.path.join(IG, '3794666856289244090.mp4')       # DSpXWaaEZO6, 24/12/2025
TUNEL = r'C:\epa-gala\material\whatsapp\17-video.mp4'     # el túnel de luces (WhatsApp): el mejor que hay
VIDEO = r'C:\galas-sistema\temas\epa\assets\video'
GALERIA = r'C:\galas-sistema\temas\epa\assets\galeria'
os.makedirs(GALERIA, exist_ok=True)

def ff(*args):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-800:])

# 0) La galería: torneos y entrenamientos (archivo de Instagram → nombre corto), en 600 y 1200 px de ancho
# Del 9 al 14 eran el resumen del Clausura 2026 de la cuenta personal de una patinadora que ya no está en la escuela
# (publicación DZGgxLqEcRH): José pidió sacarla (22/11/2026). Van en su lugar fotos donde seguro no está: entrenamientos de
# septiembre en Sarmiento, una patinadora con su profe en el Arena y una nena con su medalla en el podio de FEDECOR.
# No usar fotos de su cuenta ni de las publicaciones que la etiquetan, ni la placa #90 con su nombre.
import json
fotos = json.load(open(r'C:\epa-gala\material\hojas-ig\fotos.json', encoding='utf-8'))
ELEGIDAS = [8, 10, 11, 12, 13, 14, 15, 6, 73, 71, 75, 77, 111, 110, 109, 115, 112]
# Las apaisadas se ven en la galería en 3:4: la miniatura se recorta alrededor de la nena (x del centro, de 0 a 1);
# la grande, que se abre al tocarla, queda entera
FOCO = {73: .5, 71: .44, 75: .52, 77: .62, 111: .5, 110: .52}
SOLO_GALERIA = '--solo-galeria' in sys.argv
def galeria():
    for k, n in enumerate(ELEGIDAS, 1):
        im = Image.open(os.path.join(r'C:\epa-gala\material', fotos[n]['archivo'])).convert('RGB')
        for ancho in (600, 1200):
            c = im.copy()
            if ancho == 600 and n in FOCO and c.width / c.height > 3 / 4:
                w = round(c.height * 3 / 4); x = min(max(0, round(c.width * FOCO[n] - w / 2)), c.width - w)
                c = c.crop((x, 0, x + w, c.height))
            if c.width > ancho: c = c.resize((ancho, round(c.height * ancho / c.width)), Image.LANCZOS)
            c.save(os.path.join(GALERIA, f'g{k:02d}-{ancho}.webp'), quality=78, method=6)
    print('galería:', len(ELEGIDAS), 'fotos', flush=True)
if SOLO_GALERIA:
    galeria(); sys.exit()
galeria()

# 1) Las tomas del carrusel (vertical 432x768, en loop)
# El video del show trae arriba a la izquierda el logo de CapCut (con lo que lo editaron), en x 40-84, y 42-78 de 720x1280:
# se disimula solo ese rectángulo (delogo), así el cartel "ARENA" del cubo, que está arriba, no se pierde.
SIN_MARCA = 'delogo=x=34:y=36:w=56:h=48,'
# El video de Instagram viene en rango completo (yuvj420p): así salían las tomas, y el iPhone y algunos Android no las
# reproducen (quedaba la imagen fija; avisó una profe el 24/11/2026). Se pasa al rango normal en el scale y se marca al codificar.
RANGO = 'in_range=pc:out_range=tv'
NORMAL = ['-pix_fmt', 'yuv420p', '-color_range', 'tv']
v = SIN_MARCA + f'scale=432:768:force_original_aspect_ratio=increase:{RANGO},crop=432:768,fps=30,setsar=1,eq=saturation=1.08,format=yuv420p'
# La previa: solo la patinadora que se ata los patines (0,1 a 1,85 s; después viene la cabina 360 con la marca de agua),
# en cámara lenta aparte (ver el final del archivo).
TOMAS = [('chiquitas', SHOW, 10.0, 4.4), ('cubo', SHOW, 14.6, 6.4), ('tribuna2', SHOW, 35.5, 5.5), ('final', SHOW, 73.0, 6.0)]
for nombre, src, ini, dur in TOMAS:
    sal = os.path.join(VIDEO, f'toma-{nombre}.mp4')
    ff('-ss', str(ini), '-t', str(dur), '-i', src, '-vf', v, '-an', '-c:v', 'libx264', *NORMAL, '-preset', 'slow', '-crf', '29', '-profile:v', 'high', '-movflags', '+faststart', sal)
    ff('-ss', '0.3', '-i', sal, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '70', sal.replace('.mp4', '.webp'))
    print('toma', nombre, 'lista', flush=True)

# 2) El fondo de la sección del show: la coreografía bajo el cubo, la tribuna repleta y la formación final, en loop
partes = [(14.6, 6.4), (35.5, 8.5), (79.0, 8.0)]
F = 1.0
ins, filtros = [], []
for i, (ini, dur) in enumerate(partes + [partes[0]]):
    ins += ['-ss', str(ini), '-t', str(dur if i < len(partes) else F), '-i', SHOW]
    filtros.append(f'[{i}:v]{SIN_MARCA}scale=540:960:force_original_aspect_ratio=increase:{RANGO},crop=540:960,fps=30,setsar=1,eq=saturation=1.08,settb=AVTB[p{i}]')
d = [x[1] for x in partes]
o1 = d[0] - F; o2 = d[0] + d[1] - 2 * F; total = sum(d) - 2 * F; o3 = total - F
filtros.append(f'[p0][p1]xfade=transition=fade:duration={F}:offset={o1}[x1];[x1][p2]xfade=transition=fade:duration={F}:offset={o2}[x2];'
               f'[x2][p3]xfade=transition=fade:duration={F}:offset={o3},trim={F}:{total},setpts=PTS-STARTPTS,format=yuv420p[v]')
fondo = os.path.join(VIDEO, 'show25-fondo.mp4')
ff(*ins, '-filter_complex', ';'.join(filtros), '-map', '[v]', '-an', '-c:v', 'libx264', *NORMAL, '-preset', 'slow', '-crf', '30', '-profile:v', 'high', '-movflags', '+faststart', fondo)
ff('-ss', '0.5', '-i', fondo, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '70', fondo.replace('.mp4', '.webp'))
print('fondo del show listo', flush=True)


# La previa en cámara lenta (0,5x, cuadros intermedios por movimiento): 1,75 s → 3,5 s. Sin el logo de CapCut (SIN_MARCA).
sal = os.path.join(VIDEO, 'toma-previa.mp4')
# Al principio del video la marca es más ancha ("⌗ CapCut", x 40-218): la pared de atrás es lisa y se disimula sin que se note.
ff('-ss', '0.1', '-t', '1.75', '-i', SHOW, '-vf', f'delogo=x=34:y=36:w=190:h=48,scale=432:768:force_original_aspect_ratio=increase:{RANGO},crop=432:768,setsar=1,eq=saturation=1.08,'
   'setpts=PTS/0.5,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p',
   '-an', '-c:v', 'libx264', *NORMAL, '-preset', 'slow', '-crf', '27', '-profile:v', 'high', '-movflags', '+faststart', sal)
ff('-ss', '0.3', '-i', sal, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '72', sal.replace('.mp4', '.webp'))
