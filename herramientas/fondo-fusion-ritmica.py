# Arma el fondo de la portada de Rítmica con las 12 fotos de danza fusión del video de José (13/11/2026):
# cada foto con un movimiento lento (acercamiento o paneo) y un fundido a la siguiente, en loop sin salto.
# Dos versiones: horizontal (compu) y vertical (celular), cada una con su encuadre por foto.
# Uso: python herramientas/fondo-fusion-ritmica.py C:/ritmica-gala/material/fusion <carpeta de salida>
# (ahí están las 12 fotos recortadas f00..f11.png y el video original). Necesita Pillow y ffmpeg. Tarda unos 3 min.
# Lo que sale (fusion-compu/celu .mp4 y el primer cuadro .png, que se pasa a .webp) va a temas/santiago-ritmica/
# assets/video/ CON OTRO NOMBRE si cambia: el navegador guarda los assets un día.
import sys, subprocess
from PIL import Image

FOTOS, SALIDA = sys.argv[1], sys.argv[2]
FPS, T, X = 25, 3.0, 0.8          # 3 s por foto (como el original) y 0,8 s de fundido

# (fx, fy, z) al empezar y al terminar: fx/fy = dónde está la ventana dentro del espacio libre (0 = arriba/izquierda,
# 1 = abajo/derecha); z = acercamiento (1 = la ventana más grande que entra en la foto).
COMPU = [
    ((.5, .75, 1.0), (.5, .85, 1.08)),
    ((.5, .95, 1.07), (.5, .9, 1.0)),
    ((.5, .78, 1.0), (.5, .85, 1.08)),
    ((.5, .33, 1.0), (.5, .4, 1.07)),
    ((.5, .3, 1.0), (.5, .75, 1.0)),
    ((.5, .36, 1.0), (.5, .42, 1.07)),
    ((.5, .15, 1.0), (.5, .55, 1.0)),
    ((.5, .45, 1.0), (.5, .85, 1.0)),
    ((.5, 1.0, 1.0), (.45, 1.0, 1.08)),
    ((.5, .35, 1.0), (.5, .8, 1.0)),
    ((.5, .45, 1.0), (.5, .5, 1.08)),
    ((.5, .85, 1.0), (.5, .9, 1.08)),
]
CELU = [
    ((.2, .5, 1.0), (.7, .5, 1.0)),
    ((.2, .5, 1.0), (.8, .5, 1.0)),
    ((.4, .5, 1.0), (.6, .5, 1.06)),
    ((.45, .5, 1.0), (.5, .5, 1.06)),
    ((.75, .5, 1.0), (.9, .5, 1.0)),
    ((.0, .5, 1.0), (.15, .5, 1.04)),
    ((.3, .5, 1.0), (.7, .5, 1.0)),
    ((.7, .5, 1.0), (.3, .5, 1.0)),
    ((.15, .5, 1.0), (.75, .5, 1.0)),
    ((.2, .5, 1.0), (.6, .5, 1.0)),
    ((.1, .5, 1.0), (.6, .5, 1.0)),
    ((.2, .5, 1.0), (.8, .5, 1.0)),
]

def ventana(im, W, H, fx, fy, z):
    """Rectángulo (x0, y0, x1, y1) en la foto, con la proporción de la salida."""
    pw, ph = im.size
    if pw / ph > W / H: bh = ph; bw = ph * W / H
    else: bw = pw; bh = pw * H / W
    w, h = bw / z, bh / z
    x0 = (pw - w) * fx; y0 = (ph - h) * fy
    return x0, y0, x0 + w, y0 + h

def cuadro(im, W, H, a, b, u):
    # Movimiento parejo (sin aceleración): en un loop de fotos se ve más tranquilo.
    fx, fy, z = (a[k] + (b[k] - a[k]) * u for k in range(3))
    return im.transform((W, H), Image.Transform.EXTENT, ventana(im, W, H, fx, fy, z), Image.Resampling.BICUBIC)

def armar(nombre, W, H, plan, crf):
    fotos = [Image.open(f'{FOTOS}/f{i:02d}.png').convert('RGB') for i in range(12)]
    n = len(fotos); total = n * T; vida = T + X
    out = f'{SALIDA}/{nombre}.mp4'
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out],
                          stdin=subprocess.PIPE)
    cuadros = round(total * FPS)
    for f in range(cuadros):
        t = f / FPS
        # La foto i vive de i*T − X a (i+1)*T; la 0 entra en fundido al final, así el loop no salta.
        i = int(t // T)
        local = t - (i * T - X)
        img = cuadro(fotos[i], W, H, *plan[i], local / vida)
        entra = (i + 1) % n
        desde = (i + 1) * T - X
        if t >= desde:
            a = (t - desde) / X; a = a * a * (3 - 2 * a)
            otra = cuadro(fotos[entra], W, H, *plan[entra], (t - desde) / vida)
            img = Image.blend(img, otra, a)
        if f == 0: img.save(f'{SALIDA}/{nombre}.png')
        ff.stdin.write(img.tobytes())
    ff.stdin.close(); ff.wait()
    print(nombre, cuadros, 'cuadros')

# crf 35: es un fondo con una capa rosa encima; así queda en 1,6 MB cada uno (con 30 eran 2,6 MB y no se notaba).
armar('fusion-compu', 1280, 720, COMPU, 35)
armar('fusion-celu', 720, 1280, CELU, 35)
