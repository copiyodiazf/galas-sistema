# La patinadora animada de EPA, entera y con la remera nueva (José, 22/11/2026: en la página se cortaban los patines; la de
# antes venía recortada de origen, sin el freno del patín derecho). Se le saca el fondo blanco con rembg (modelo isnet-anime,
# el que mejor respeta el pelo y los cordones), se recorta a lo que ocupa y se guarda en webp con transparencia.
# Uso: <python con rembg> herramientas/mascota-epa.py   (el de la sesión: scratchpad/venv-rembg)
import os, sys
from PIL import Image
from rembg import remove, new_session

ORIGEN = r'C:\epa-gala\material\remera\remera-mascota.jpeg'      # 1086x1448, fondo blanco (WhatsApp de José)
DESTINO = r'C:\galas-sistema\temas\epa\assets\mascota.webp'
ANCHO = 600                                                       # se muestra a 300 px como mucho: 2x para pantallas densas

im = Image.open(ORIGEN).convert('RGB')
sin_fondo = remove(im, session=new_session('isnet-anime'), post_process_mask=True)
# Recortar a lo que ocupa la figura (con un margen chico para la sombra del CSS)
caja = sin_fondo.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
m = 6
caja = (max(0, caja[0] - m), max(0, caja[1] - m), min(im.width, caja[2] + m), min(im.height, caja[3] + m))
fig = sin_fondo.crop(caja)
if fig.width > ANCHO:
    fig = fig.resize((ANCHO, round(fig.height * ANCHO / fig.width)), Image.LANCZOS)
fig.save(DESTINO, quality=88, method=6)
print('mascota:', fig.size, round(os.path.getsize(DESTINO) / 1024), 'KB', file=sys.stderr)
