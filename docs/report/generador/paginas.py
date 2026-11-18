"""Busca en el PDF la página de cada título, tabla y figura. Uso: paginas.py <pdf> <entries.json> <salida.json>"""
import json, re, subprocess, sys
pdf, entries, out = sys.argv[1:4]
E = json.load(open(entries))
n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
pages = [subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), "-layout", pdf, "-"], capture_output=True, text=True).stdout
         for i in range(1, n + 1)]
norm = lambda s: re.sub(r"\s+", " ", s.replace("₂", "2")).strip()
lines = [[norm(l) for l in p.splitlines() if l.strip()] for p in pages]
start = next(i for i, ls in enumerate(lines) if ls and ls[0].startswith("1. INTRODUCCIÓN"))
res = {}
def find(text, key):
    for i in range(start, n):
        for l in lines[i]:
            if l.startswith(key):
                res[text] = str(i + 1); return
    res[text] = "??"; print("NO ENCONTRADO:", text)
for lvl, t in E["toc"]:
    find(t, norm(t)[:30])
for t in E["tab"] + E["fig"]:
    find(t, t.split(". ")[0] + ".")
json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
print("páginas:", n)
