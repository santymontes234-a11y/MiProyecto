"""Genera los diagramas del entregable ABD (sin dependencias externas).

    python3 docs/report/diagramas/generar_diagramas.py <columnas.tsv>

`columnas.tsv` es la salida de `columnas.sql` sobre una BD creada con database/01_esquema.sql:

    psql -d ecomove_abd -AtF $'\\t' -f docs/report/diagramas/columnas.sql > /tmp/columnas.tsv

Produce en esta carpeta:
- MER.mmd  — modelo relacional en Mermaid (erDiagram), todas las tablas y columnas.
- MER.svg  — el mismo modelo dibujado (cajas por tabla, PK/FK, notación pata de gallo).
- EER.svg  — modelo entidad-relación extendido en notación de Chen: entidades, relaciones con
             cardinalidad, atributos clave, entidades débiles y especializaciones
             (POI: disjunta y parcial; Usuario: disjunta y total por el atributo `role`).
"""

import collections
import sys
from html import escape
from pathlib import Path

OUT = Path(__file__).parent

# --------------------------------------------------------------------------------------------------
# MER (modelo relacional)
# --------------------------------------------------------------------------------------------------

LAYOUT = [  # columnas del dibujo, de izquierda a derecha
    ["roles", "role_permissions", "permissions", "user_tokens", "refresh_tokens"],
    ["users", "user_preferences", "audit_logs", "reports"],
    ["trips", "notifications"],
    ["transport_modes", "emission_factors", "vehicle_types", "user_achievements", "achievements"],
    ["citizen_reports", "pois", "transit_stops", "bike_stations"],
    ["stop_lines", "transit_lines", "cycleways", "geo.mobility_zones", "geo.zone_census"],
]
SHORT = {"timestamp with time zone": "timestamptz", "character varying": "varchar", "double precision": "float8",
         "boolean": "bool", "integer": "int4", "smallint": "int2", "character": "char"}


def short_type(t: str) -> str:
    for k, v in SHORT.items():
        t = t.replace(k, v)
    return t.replace("public.geometry", "geometry")


def load(tsv: str):  # noqa: ANN201
    tables: dict[str, list[dict]] = collections.OrderedDict()
    comments = {}
    fks = []
    for line in open(tsv, encoding="utf-8"):
        if not line.strip():
            continue
        schema, table, tcomment, _, col, typ, _null, _default, cons, _desc = line.rstrip("\n").split("\t")
        name = table if schema == "public" else f"{schema}.{table}"
        comments[name] = tcomment
        tables.setdefault(name, []).append({"col": col, "type": short_type(typ), "cons": cons})
        for part in cons.split(", "):
            if part.startswith("FK → "):
                target = part[5:]
                tname, tcol = target.split("(")
                tname = tname.removeprefix("public.")
                fks.append((name, col, tname, tcol.rstrip(")").split(",")[0]))
    return tables, comments, fks


def mermaid(tables, fks) -> str:  # noqa: ANN001
    out = ["erDiagram"]
    for name, cols in tables.items():
        out.append(f"    {name.replace('.', '_')} {{")
        for c in cols:
            keys = ",".join(k for k in ("PK", "FK", "UK") if (k if k != "UK" else "UQ") in c["cons"])
            typ = c["type"].replace(" ", "_").replace(",", "_").replace("(", "_").replace(")", "")
            out.append(f"        {typ} {c['col']}{' ' + keys if keys else ''}")
        out.append("    }")
    for src, col, dst, _ in fks:
        src_cols = {c["col"]: c for c in tables[src]}
        one_to_one = "PK" in src_cols[col]["cons"] and len([c for c in tables[src] if "PK" in c["cons"]]) == 1
        card = "||--o|" if one_to_one else "||--o{"
        out.append(f'    {dst.replace(".", "_")} {card} {src.replace(".", "_")} : "{col}"')
    return "\n".join(out) + "\n"


def mer_svg(tables, comments, fks) -> str:  # noqa: ANN001, C901
    W, ROW, HEAD, GAPX, GAPY = 250, 15, 22, 95, 26
    pos: dict[str, tuple[float, float, float]] = {}
    x = 20
    max_h = 0
    for column in LAYOUT:
        y = 60
        for name in column:
            h = HEAD + ROW * len(tables[name]) + 6
            pos[name] = (x, y, h)
            y += h + GAPY
        max_h = max(max_h, y)
        x += W + GAPX
    width, height = x, max_h + 20
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
           f'viewBox="0 0 {width} {height}" font-family="Arial, Helvetica, sans-serif">',
           '<rect width="100%" height="100%" fill="#ffffff"/>',
           '<text x="20" y="32" font-size="20" font-weight="bold" fill="#1b4332">EcoMove Querétaro — '
           'Modelo relacional (MER)</text>',
           '<text x="20" y="50" font-size="11" fill="#555">PostgreSQL 16 + PostGIS · 25 tablas · '
           'PK = clave primaria, FK = clave foránea, UQ = única · pata de gallo = lado «muchos»</text>']

    def anchor(name: str, col: str, side: str) -> tuple[float, float]:
        x0, y0, _ = pos[name]
        idx = next(i for i, c in enumerate(tables[name]) if c["col"] == col)
        return (x0 + (W if side == "r" else 0), y0 + HEAD + ROW * idx + ROW / 2 + 1)

    lines = []
    for n_fk, (src, col, dst, dcol) in enumerate(fks):
        sx = pos[src][0]
        dx = pos[dst][0]
        if sx > dx:
            a, b = anchor(src, col, "l"), anchor(dst, dcol, "r")
        elif sx < dx:
            a, b = anchor(src, col, "r"), anchor(dst, dcol, "l")
        else:  # misma columna: rodeo por la derecha
            a, b = anchor(src, col, "r"), anchor(dst, dcol, "r")
        if sx == dx:
            off = 18 + (n_fk % 5) * 7
            path = f"M{a[0]},{a[1]} h{off} V{b[1]} H{b[0]}"
            many_dir, one_dir = 1, 1
        else:
            midx = (a[0] + b[0]) / 2 + ((n_fk % 7) - 3) * 6
            path = f"M{a[0]},{a[1]} H{midx} V{b[1]} H{b[0]}"
            many_dir = 1 if b[0] > a[0] else -1
            one_dir = -many_dir
        color = ["#2d6a4f", "#1d4e89", "#9c4221", "#6b46c1", "#975a16", "#2c7a7b"][n_fk % 6]
        lines.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.3" opacity="0.85"/>')
        # «muchos» (pata de gallo) en el lado de la FK; «uno» (doble barra) en el lado referenciado.
        ax, ay = a
        lines.append(f'<path d="M{ax},{ay - 5} L{ax + 9 * many_dir},{ay} L{ax},{ay + 5} M{ax},{ay} '
                     f'H{ax + 9 * many_dir}" stroke="{color}" fill="none" stroke-width="1.3"/>')
        bx, by = b
        d = -one_dir if sx != dx else 1
        lines.append(f'<path d="M{bx + 5 * d},{by - 5} v10 M{bx + 9 * d},{by - 5} v10" stroke="{color}" '
                     f'stroke-width="1.3"/>')
    svg += lines
    for name, (x0, y0, h) in pos.items():
        geo = name.startswith("geo.")
        fill = "#e9f5ee" if not geo else "#e8f1fb"
        head = "#2d6a4f" if not geo else "#1d4e89"
        svg.append(f'<g><title>{escape(comments[name])}</title>'
                   f'<rect x="{x0}" y="{y0}" width="{W}" height="{h}" rx="5" fill="{fill}" stroke="{head}"/>'
                   f'<rect x="{x0}" y="{y0}" width="{W}" height="{HEAD}" rx="5" fill="{head}"/>'
                   f'<text x="{x0 + 8}" y="{y0 + 15}" font-size="12.5" font-weight="bold" fill="#fff">'
                   f'{escape(name)}</text>')
        for i, c in enumerate(tables[name]):
            ty = y0 + HEAD + ROW * i + 12
            keys = [k for k in ("PK", "FK", "UQ") if k in c["cons"]]
            weight = ' font-weight="bold"' if "PK" in keys else ""
            deco = ' text-decoration="underline"' if "PK" in keys else ""
            svg.append(f'<text x="{x0 + 6}" y="{ty}" font-size="10.5"{weight}{deco} fill="#1a1a1a">'
                       f'{escape(c["col"])}</text>')
            svg.append(f'<text x="{x0 + 132}" y="{ty}" font-size="9.5" fill="#555">'
                       f'{escape(c["type"][:24])}</text>')
            if keys:
                svg.append(f'<text x="{x0 + W - 6}" y="{ty}" font-size="9" text-anchor="end" fill="#9c4221" '
                           f'font-weight="bold">{"·".join(keys)}</text>')
        svg.append("</g>")
    svg.append("</svg>")
    return "\n".join(svg)


# --------------------------------------------------------------------------------------------------
# EER (notación de Chen extendida)
# --------------------------------------------------------------------------------------------------

# entidad: (x, y, débil?)
ENT = {
    "ROL": (110, 150, False), "PERMISO": (110, 420, False), "SESIÓN": (110, 640, True),
    "USUARIO": (560, 420, False), "PREFERENCIAS": (560, 150, True),
    "CIUDADANO": (360, 860, False), "ADMINISTRADOR": (560, 960, False), "SUPERADMINISTRADOR": (800, 900, False),
    "VIAJE": (1040, 420, False), "MEDIO DE TRANSPORTE": (1480, 260, False), "FACTOR DE EMISIÓN": (1480, 90, True),
    "TIPO DE VEHÍCULO": (1480, 560, False), "LOGRO": (1040, 150, False), "NOTIFICACIÓN": (830, 640, False),
    "REPORTE CIUDADANO": (1040, 860, False), "POI": (1480, 860, False),
    "PARADA": (1320, 1150, False), "ESTACIÓN DE BICI": (1660, 1150, False), "LÍNEA": (1320, 1390, False),
    "CICLOVÍA": (1880, 420, False), "ZONA": (1880, 680, False), "CENSO": (1880, 940, True),
    "INFORME": (360, 1130, False), "BITÁCORA": (760, 1130, False),
}
# relación: (x, y, entidad A, card A, entidad B, card B, débil?, atributos)
REL = [
    ("POSEE", 110, 290, "USUARIO", "N", "ROL", "1", False, []),
    ("OTORGA", 110, 290 + 0, "ROL", "M", "PERMISO", "N", False, []),
    ("ABRE", 330, 640, "USUARIO", "1", "SESIÓN", "N", True, []),
    ("CONFIGURA", 560, 285, "USUARIO", "1", "PREFERENCIAS", "1", True, []),
    ("REALIZA", 800, 420, "USUARIO", "1", "VIAJE", "N", False, []),
    ("USA", 1285, 330, "VIAJE", "N", "MEDIO DE TRANSPORTE", "1", False, []),
    ("SE ESTIMA CON", 1480, 175, "MEDIO DE TRANSPORTE", "1", "FACTOR DE EMISIÓN", "1", True, []),
    ("EN VEHÍCULO", 1260, 500, "VIAJE", "N", "TIPO DE VEHÍCULO", "1", False, ["occupants"]),
    ("OBTIENE", 800, 200, "USUARIO", "M", "LOGRO", "N", False, ["awarded_at", "bonus_points"]),
    ("RECIBE", 700, 560, "USUARIO", "1", "NOTIFICACIÓN", "N", False, []),
    ("REPORTA", 360, 760, "CIUDADANO", "1", "REPORTE CIUDADANO", "N", False, []),
    ("ATIENDE", 820, 1000, "ADMINISTRADOR", "1", "REPORTE CIUDADANO", "N", False, ["resolution_note"]),
    ("SOBRE", 1260, 860, "REPORTE CIUDADANO", "N", "POI", "1", False, []),
    ("PASA POR", 1320, 1270, "PARADA", "M", "LÍNEA", "N", False, []),
    ("PERTENECE", 1880, 810, "ZONA", "1", "CENSO", "N", True, []),
    ("GENERA", 360, 1040 + 0, "ADMINISTRADOR", "1", "INFORME", "N", False, []),
    ("REGISTRA", 660, 1060, "ADMINISTRADOR", "1", "BITÁCORA", "N", False, []),
]
# atributos por entidad (los que empiezan por * son clave; ~ = multivaluado/compuesto no aplica; ° derivado)
ATTR = {
    "USUARIO": ["*id", "email", "full_name", "password_hash", "is_active", "role"],
    "ROL": ["*name", "level"], "PERMISO": ["*code", "description"], "SESIÓN": ["*family_id", "user_agent"],
    "PREFERENCIAS": ["language", "weekly_goal_trips"],
    "VIAJE": ["*id", "started_at", "ended_at", "route", "°distance_m", "°co2_saved_g", "°points", "source"],
    "MEDIO DE TRANSPORTE": ["*mode", "max_speed_kmh", "is_active"], "FACTOR DE EMISIÓN": ["grams_per_km"],
    "TIPO DE VEHÍCULO": ["*code", "grams_per_km", "max_occupants", "source"],
    "LOGRO": ["*id", "code", "criterion", "threshold"], "NOTIFICACIÓN": ["*id", "type", "read_at"],
    "REPORTE CIUDADANO": ["*id", "category", "status", "location"],
    "POI": ["*id", "name", "category", "location"], "PARADA": ["code", "osm_ref"],
    "ESTACIÓN DE BICI": ["code", "capacity"], "LÍNEA": ["*id", "code"],
    "CICLOVÍA": ["*id", "geom", "is_protected"], "ZONA": ["*code", "name", "kind", "geom", "°area_km2"],
    "CENSO": ["*source", "pobtot", "vph_bici"], "INFORME": ["*id", "report_type", "format"],
    "BITÁCORA": ["*id", "action", "payload"],
}
ATTR_SIDE = {"USUARIO": "s", "VIAJE": "grid", "ZONA": "e", "CICLOVÍA": "e", "CENSO": "e", "POI": "e",
             "PARADA": "w", "ESTACIÓN DE BICI": "e", "LÍNEA": "w", "ROL": "n", "PERMISO": "s", "SESIÓN": "s",
             "MEDIO DE TRANSPORTE": "e", "FACTOR DE EMISIÓN": "e", "TIPO DE VEHÍCULO": "e", "LOGRO": "n",
             "NOTIFICACIÓN": "s", "REPORTE CIUDADANO": "s", "INFORME": "s", "BITÁCORA": "s", "PREFERENCIAS": "n"}
EW, EH = 176, 44


def eer_svg() -> str:  # noqa: C901
    width, height = 2140, 1560
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} '
         f'{height}" font-family="Arial, Helvetica, sans-serif">', '<rect width="100%" height="100%" fill="#fff"/>',
         '<text x="20" y="30" font-size="20" font-weight="bold" fill="#1b4332">EcoMove Querétaro — Modelo '
         'entidad-relación extendido (EER, notación de Chen)</text>',
         '<text x="20" y="48" font-size="11" fill="#555">Rectángulo = entidad · doble rectángulo = entidad débil · '
         'rombo = relación (doble = identificadora) · óvalo = atributo (subrayado = clave, punteado = derivado) · '
         'círculo d = especialización disjunta (línea doble = total, simple = parcial) · '
         'atributos completos en DICCIONARIO_DATOS.md</text>']
    layer_lines, layer_shapes = [], []

    def line(a: tuple[float, float], b: tuple[float, float], double: bool = False, label: str = "") -> None:
        layer_lines.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#333" '
                           f'stroke-width="{3.5 if double else 1.3}"/>')
        if double:
            layer_lines.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#fff" '
                               f'stroke-width="1.2"/>')
        if label:
            mx, my = a[0] + (b[0] - a[0]) * 0.72, a[1] + (b[1] - a[1]) * 0.72
            layer_shapes.append(f'<text x="{mx + 6}" y="{my - 5}" font-size="13" font-weight="bold" '
                                f'fill="#9c4221">{label}</text>')

    def edge_point(name: str, tx: float, ty: float) -> tuple[float, float]:
        x, y, _ = ENT[name]
        dx, dy = tx - x, ty - y
        if dx == 0 and dy == 0:
            return x, y
        sx = (EW / 2) / abs(dx) if dx else 1e9
        sy = (EH / 2) / abs(dy) if dy else 1e9
        k = min(sx, sy)
        return x + dx * k, y + dy * k

    # Atributos
    for ent, attrs in ATTR.items():
        x, y, _ = ENT[ent]
        side = ATTR_SIDE.get(ent, "n")
        n = len(attrs)
        for i, a in enumerate(attrs):
            key, derived = a.startswith("*"), a.startswith("°")
            label = a.lstrip("*°")
            if side == "grid":  # dos filas de 4 por encima de la entidad
                ax = x + (i % 4 - 2) * 112
                ay = y - 70 - (i // 4) * 40
            elif side in ("n", "s"):
                ax = x + (i - (n - 1) / 2) * 112
                ay = y + (-78 if side == "n" else 78)
            else:
                ax = x + (150 if side == "e" else -150) + (i % 2) * (14 if side == "e" else -14)
                ay = y + (i - (n - 1) / 2) * 34
            line((x, y), (ax, ay))
            rx = max(38, len(label) * 3.6 + 12)
            dash = ' stroke-dasharray="4 3"' if derived else ""
            deco = ' text-decoration="underline"' if key else ""
            layer_shapes.append(f'<ellipse cx="{ax}" cy="{ay}" rx="{rx}" ry="14" fill="#fffbea" stroke="#975a16"'
                                f'{dash}/><text x="{ax}" y="{ay + 4}" font-size="10.5" text-anchor="middle"{deco}>'
                                f'{escape(label)}</text>')
    # Relaciones
    for name, rx, ry, a, ca, b, cb, weak, attrs in REL:
        if name == "OTORGA":
            rx, ry = 110, 285
        if name == "POSEE":
            rx, ry = 330, 285
        if name == "GENERA":
            rx, ry = 430, 1040
        for ent, card in ((a, ca), (b, cb)):
            ex, ey = edge_point(ent, rx, ry)
            total = (weak and ent in ("SESIÓN", "PREFERENCIAS", "FACTOR DE EMISIÓN", "CENSO"))
            line((rx, ry), (ex, ey), double=total, label=card)
        for i, at in enumerate(attrs):
            if name == "ATIENDE":
                ax, ay = rx, ry + 62
            elif name == "OBTIENE":
                ax, ay = rx - 135, ry - 16 * (len(attrs) - 1) + i * 32
            else:
                ax, ay = rx + 130, ry - 16 * (len(attrs) - 1) + i * 32
            line((rx, ry), (ax, ay))
            layer_shapes.append(f'<ellipse cx="{ax}" cy="{ay}" rx="{len(at) * 3.6 + 14}" ry="13" fill="#fffbea" '
                                f'stroke="#975a16"/><text x="{ax}" y="{ay + 4}" font-size="10" '
                                f'text-anchor="middle">{at}</text>')
        w2, h2 = 62, 28
        pts = f"{rx},{ry - h2} {rx + w2},{ry} {rx},{ry + h2} {rx - w2},{ry}"
        layer_shapes.append(f'<polygon points="{pts}" fill="#e8f1fb" stroke="#1d4e89" stroke-width="1.5"/>')
        if weak:
            pts2 = f"{rx},{ry - h2 + 5} {rx + w2 - 9},{ry} {rx},{ry + h2 - 5} {rx - w2 + 9},{ry}"
            layer_shapes.append(f'<polygon points="{pts2}" fill="none" stroke="#1d4e89"/>')
        layer_shapes.append(f'<text x="{rx}" y="{ry + 4}" font-size="10" font-weight="bold" text-anchor="middle" '
                            f'fill="#1d4e89">{escape(name)}</text>')

    # Especializaciones
    def specialization(sup: str, subs: list[str], cx: float, cy: float, total: bool, note: str) -> None:
        sx, sy = edge_point(sup, cx, cy)
        line((sx, sy), (cx, cy), double=total)
        for sub in subs:
            ex, ey = edge_point(sub, cx, cy)
            line((cx, cy), (ex, ey))
            # símbolo de subconjunto (⊂) a mitad del arco
            mx, my = (cx + ex) / 2, (cy + ey) / 2
            layer_shapes.append(f'<text x="{mx}" y="{my + 5}" font-size="16" text-anchor="middle" '
                                f'fill="#2d6a4f">⊂</text>')
        layer_shapes.append(f'<circle cx="{cx}" cy="{cy}" r="17" fill="#fff" stroke="#2d6a4f" stroke-width="1.8"/>'
                            f'<text x="{cx}" y="{cy + 5}" font-size="15" font-weight="bold" text-anchor="middle" '
                            f'fill="#2d6a4f">d</text><text x="{cx + 24}" y="{cy - 10}" font-size="10.5" '
                            f'fill="#2d6a4f">{escape(note)}</text>')

    specialization("POI", ["PARADA", "ESTACIÓN DE BICI"], 1480, 1020, False,
                   "category · disjunta, parcial (EV_CHARGER y REPAIR_STATION sin subtipo)")
    specialization("USUARIO", ["CIUDADANO", "ADMINISTRADOR", "SUPERADMINISTRADOR"], 560, 700, True,
                   "role · disjunta, total")

    # Entidades
    for name, (x, y, weak) in ENT.items():
        s_fill = "#e9f5ee"
        layer_shapes.append(f'<rect x="{x - EW / 2}" y="{y - EH / 2}" width="{EW}" height="{EH}" fill="{s_fill}" '
                            f'stroke="#1b4332" stroke-width="1.8"/>')
        if weak:
            layer_shapes.append(f'<rect x="{x - EW / 2 + 5}" y="{y - EH / 2 + 5}" width="{EW - 10}" '
                                f'height="{EH - 10}" fill="none" stroke="#1b4332"/>')
        layer_shapes.append(f'<text x="{x}" y="{y + 5}" font-size="12" font-weight="bold" text-anchor="middle" '
                            f'fill="#1b4332">{escape(name)}</text>')
    s += layer_lines + layer_shapes + ["</svg>"]
    return "\n".join(s)


def main() -> None:
    tables, comments, fks = load(sys.argv[1])
    (OUT / "MER.mmd").write_text(mermaid(tables, fks), encoding="utf-8")
    (OUT / "MER.svg").write_text(mer_svg(tables, comments, fks), encoding="utf-8")
    (OUT / "EER.svg").write_text(eer_svg(), encoding="utf-8")
    print(f"{len(tables)} tablas, {len(fks)} FK")


if __name__ == "__main__":
    main()
