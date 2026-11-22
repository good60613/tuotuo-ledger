# 3.1 新增六張拖拖硬幣：從透明原圖切成 256x256（src/assets/coins31/*.png）。
# 做法：依透明度找出每個「連通塊」，大塊＝各貼圖的主體；小塊（星星、驚嘆號、泡泡）歸到距離最近的主體；
#      每張只留自己的部分（不會切到旁邊貼圖的碎片），再貼進 256x256 正方形。
# 用法（專案根目錄）：py -3 tools/cut-coins31.py
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = '素材/拖拖硬幣/原圖/3.1新增六張(透明).png'
OUT = 'src/assets/coins31/'
# 主體（大塊）的重心大約位置 → 檔名（左到右、上到下：購物、吃飯、交通 / 投資、撲滿、帳單）
NAMES = [('shop', (275, 306)), ('eat', (748, 280)), ('transit', (1250, 264)),
         ('rich', (244, 755)), ('piggy', (732, 737)), ('bill', (1223, 726))]
SIZE, FIT = 256, 244  # 輸出邊長、內容最長邊（留一點邊）

im = Image.open(SRC).convert('RGBA')
rgba = np.array(im)
lab, n = ndi.label(rgba[:, :, 3] > 20)
objs = ndi.find_objects(lab)
comps = []
for i, sl in enumerate(objs, 1):
    m = lab[sl] == i
    area = int(m.sum())
    if area < 150:
        continue  # 雜訊
    cy, cx = ndi.center_of_mass(lab == i)
    comps.append(dict(id=i, area=area, box=(sl[1].start, sl[0].start, sl[1].stop, sl[0].stop), c=(cx, cy)))

mains = sorted(comps, key=lambda c: -c['area'])[:6]
owner = {}
for name, (nx, ny) in NAMES:
    best = min(mains, key=lambda c: (c['c'][0] - nx) ** 2 + (c['c'][1] - ny) ** 2)
    owner[best['id']] = name

def gap(a, b):  # 兩個外框之間的最短距離
    dx = max(a[0] - b[2], b[0] - a[2], 0)
    dy = max(a[1] - b[3], b[1] - a[3], 0)
    return (dx * dx + dy * dy) ** 0.5

for c in comps:
    if c['id'] in owner:
        continue
    near = min(mains, key=lambda m: gap(c['box'], m['box']))
    owner[c['id']] = owner[near['id']]

for name, _ in NAMES:
    ids = [i for i, o in owner.items() if o == name]
    mask = np.isin(lab, ids)
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    piece = rgba[y0:y1, x0:x1].copy()
    piece[~mask[y0:y1, x0:x1]] = 0  # 只留自己的部分
    tile = Image.fromarray(piece, 'RGBA')
    k = FIT / max(tile.size)
    tile = tile.resize((max(1, round(tile.size[0] * k)), max(1, round(tile.size[1] * k))), Image.LANCZOS)
    out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(tile, ((SIZE - tile.size[0]) // 2, (SIZE - tile.size[1]) // 2), tile)
    out.save(OUT + name + '.png', optimize=True)
    print(name, '部分數', len(ids), '原始範圍', (x0, y0, x1, y1))
