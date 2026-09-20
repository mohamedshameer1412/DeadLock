"""Builds fake-webcam videos (y4m) from a public-domain portrait bundled with scikit-image (NASA astronaut photo), so the
face check can be tried without a person in front of a camera: one face, and two faces side by side."""
import sys

import numpy as np
from PIL import Image
from skimage import data

W, H, FRAMES = 640, 480, 20


def canvas(faces: int) -> Image.Image:
    photo = Image.fromarray(data.astronaut())                      # 512x512, one face
    bg = Image.new("RGB", (W, H), (60, 70, 80))
    if faces == 1:
        bg.paste(photo.resize((H, H)), ((W - H) // 2, 0))
    else:
        head = photo.crop((150, 10, 350, 310)).resize((W // 2, H))        # two people at a laptop: each face about a third of the picture's width
        bg.paste(head, (0, 0))
        bg.paste(head, (W // 2, 0))
    return bg


def to_y4m(img: Image.Image, path: str) -> None:
    ycc = img.convert("YCbCr")
    y, cb, cr = [np.asarray(c, dtype=np.uint8) for c in ycc.split()]
    cb = np.asarray(Image.fromarray(cb).resize((W // 2, H // 2), Image.BILINEAR), dtype=np.uint8)
    cr = np.asarray(Image.fromarray(cr).resize((W // 2, H // 2), Image.BILINEAR), dtype=np.uint8)
    with open(path, "wb") as f:
        f.write(f"YUV4MPEG2 W{W} H{H} F15:1 Ip A1:1 C420jpeg\n".encode())
        for i in range(FRAMES):
            f.write(b"FRAME\n")
            noise = (np.random.RandomState(i).randint(-1, 2, y.shape)).astype(np.int16)   # a live camera is never perfectly still
            f.write(np.clip(y.astype(np.int16) + noise, 0, 255).astype(np.uint8).tobytes() + cb.tobytes() + cr.tobytes())


out = sys.argv[1]
to_y4m(canvas(1), f"{out}/one-face.y4m")
to_y4m(canvas(2), f"{out}/two-faces.y4m")
Image.open  # noqa
canvas(1).save(f"{out}/one-face.png")
canvas(2).save(f"{out}/two-faces.png")
print("written")
