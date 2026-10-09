"""build-paper.py: the real Adult Vital Signs Chart (Janine's deck, slide 34) cleaned for printing.

  python tools/build-paper.py      ->  print/vs-chart.png (the chart page)  +  print/escalation.png (the pathway panel)

The slide image carries a green guide line and a dashed diagonal someone drew over the grid. Inside the right
half of the grid each is repaired by copying the SAME cell position from the left half (the two halves are the
same 9-column grid). A second green guide line through the pathway panel is left alone (see main()).
Coordinates are the slide image's own pixels; js/paper.js uses the same ones (GEO) to place the answers."""
import os
from PIL import Image
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src', 'vs-chart-slide34.png')
OUT = os.path.join(HERE, '..', 'print')

L = [376, 410, 443, 477, 514, 548, 581, 615, 648, 682]     # left-half column edges (9 columns)
R = [716, 749, 783, 816, 850, 885, 919, 952, 986, 1020]    # right-half column edges
CHART_BOX = (150, 8, 1112, 1118)                           # the chart page, without the patient-label strip
PANEL_BOX = (1118, 0, 1723, 1118)                          # the escalation pathway panel


def left_twin(x):
    """x inside the right half -> the same position inside the left half"""
    for j in range(9):
        if R[j] <= x < R[j + 1]:
            return L[j] + round((x - R[j]) * (L[j + 1] - L[j]) / (R[j + 1] - R[j]))
    return None


def main():
    a = np.asarray(Image.open(SRC).convert('RGB')).copy()
    h, w, _ = a.shape
    mask = np.zeros((h, w), bool)
    # 1) the green guide line through the grid (muted green, ~5 px wide, full height, centred on x 864)
    gcols = list(range(861, 868))
    mask[:, gcols] = True
    # 2) the dashed diagonal drawn over the grid, (683,635) -> (888,747). Inside the grid's right half every
    #    pixel within 6 px of it that is darker than its left-half twin is repaired (plus a 1 px halo). Its short
    #    run through the EWS score column is left alone: copying there doubles the "3" it crosses.
    x0, y0, x1, y1 = 683, 635, 888, 747
    px = a.astype(int).sum(axis=2)
    for x in range(R[0] + 1, x1 + 3):
        yc = y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        t = left_twin(x)
        for y in range(int(yc) - 6, int(yc) + 7):
            if px[y, x] < px[y, t] - 45:
                mask[y - 1:y + 2, x - 1:x + 2] = True
    # The pathway panel's guide line (x ~1300) is left as it is: it runs through text, the letters still read through
    # it, and every repair tried (neighbour copy, flat-field, ink/background unmixing) cost letters ("red zone").
    fixed = 0
    for y, x in zip(*np.nonzero(mask)):
        t = left_twin(x)
        if t is not None:
            a[y, x] = a[y, t]
            fixed += 1
    im = Image.fromarray(a)
    os.makedirs(OUT, exist_ok=True)
    im.crop(CHART_BOX).save(os.path.join(OUT, 'vs-chart.png'), optimize=True)
    im.crop(PANEL_BOX).save(os.path.join(OUT, 'escalation.png'), optimize=True)
    print('green guide columns', gcols, '| pixels repaired', fixed)
    for f in ('vs-chart.png', 'escalation.png'):
        p = os.path.join(OUT, f)
        print(f, Image.open(p).size, os.path.getsize(p) // 1024, 'KB')


if __name__ == '__main__':
    main()
