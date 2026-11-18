"""Genera las figuras del informe (logo, MER, EER en PNG y gráficas de estadísticas).
Uso: python figuras.py <carpeta_salida>   (desde la raíz del repositorio)"""
import sys, os, cairosvg, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
O = sys.argv[1]; os.makedirs(O, exist_ok=True); R = "docs/report/"
cairosvg.svg2png(url="docs/brand/logo.svg", write_to=f"{O}/logo.png", output_width=600, output_height=600)
cairosvg.svg2png(url=R+"diagramas/MER.svg", write_to=f"{O}/MER.png", output_width=4180)
cairosvg.svg2png(url=R+"diagramas/EER.svg", write_to=f"{O}/EER.png", output_width=4280)
plt.rcParams.update({"font.family": ["Arial", "Liberation Sans"], "font.size": 11,
                     "axes.spines.top": False, "axes.spines.right": False})
G, B, T, Y, GR = "#16A34A", "#2563EB", "#0D9488", "#EAB308", "#6B7280"
mun = ["Querétaro", "Corregidora", "El Marqués"]
def save(fig, name):
    fig.tight_layout(); fig.savefig(f"{O}/{name}.png", dpi=200); plt.close(fig)
# Tabla 4 de ANALISIS_DATOS
x = np.arange(4); w = 0.38
par = [58.2, 66.5, 57.0, 26.4]; cic = [20.9, 22.8, 14.4, 21.4]
fig, ax = plt.subplots(figsize=(7.5, 4))
b1 = ax.bar(x-w/2, par, w, color=B, label="A ≤ 400 m de una parada de autobús")
b2 = ax.bar(x+w/2, cic, w, color=G, label="A ≤ 300 m de una ciclovía")
for b in list(b1)+list(b2):
    ax.text(b.get_x()+b.get_width()/2, b.get_height()+1, f"{b.get_height():.1f} %", ha="center", fontsize=10)
ax.set_xticks(x, ["Área de estudio"]+mun); ax.set_ylabel("Población urbana (%)"); ax.set_ylim(0, 80)
ax.legend(frameon=False, loc="upper right"); save(fig, "g_cobertura")
# Tabla 3
fig, ax = plt.subplots(figsize=(7.5, 3.2)); v = [1.59, 1.22, 4.60]
bs = ax.barh(mun[::-1], v[::-1], color=T)
for b in bs:
    ax.text(b.get_width()+0.05, b.get_y()+b.get_height()/2, f"{b.get_width():.2f}", va="center", fontsize=10)
ax.set_xlabel("Kilómetros de ciclovía por cada 10 000 habitantes urbanos"); ax.set_xlim(0, 5.3)
save(fig, "g_ciclovia")
# Tabla 5
fig, ax = plt.subplots(figsize=(7.5, 4)); x = np.arange(3); w = 0.26
for off, vals, c, l in [(-w, [62.9, 76.6, 58.5], GR, "Automóvil o camioneta"),
                        (0, [15.2, 15.9, 18.8], G, "Bicicleta"), (w, [8.1, 8.5, 6.8], Y, "Motocicleta")]:
    bs = ax.bar(x+off, vals, w, color=c, label=l)
    for b in bs:
        ax.text(b.get_x()+b.get_width()/2, b.get_height()+1, f"{b.get_height():.1f}", ha="center", fontsize=9)
ax.set_xticks(x, mun); ax.set_ylabel("Viviendas particulares habitadas (%)"); ax.set_ylim(0, 90)
ax.legend(frameon=False, ncol=3, loc="upper center"); save(fig, "g_viviendas")
