"""Genera Presentacion_EcoMove.pptx (E4). Uso: python presentacion.py <carpeta_figuras> <salida.pptx>"""
import sys
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Cm, Pt

FIG, OUT = sys.argv[1], sys.argv[2]
EV = "docs/report/evidencias/"
GREEN, DARK, LIGHT = RGBColor(0x16, 0xA3, 0x4A), RGBColor(0x14, 0x53, 0x2D), RGBColor(0xDC, 0xFC, 0xE7)
TEAL, BLUE, YELLOW = RGBColor(0x0D, 0x94, 0x88), RGBColor(0x25, 0x63, 0xEB), RGBColor(0xEA, 0xB3, 0x08)
INK, MUTED, WHITE = RGBColor(0x11, 0x18, 0x27), RGBColor(0x4B, 0x55, 0x63), RGBColor(0xFF, 0xFF, 0xFF)

prs = Presentation()
prs.slide_width, prs.slide_height = Cm(33.867), Cm(19.05)
W, Hh = prs.slide_width, prs.slide_height
BLANK = prs.slide_layouts[6]
NUM = [0]

def text(slide, x, y, w, h, paras, size=20, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
         highlight=False):
    tb = slide.shapes.add_textbox(x, y, w, h); tf = tb.text_frame; tf.word_wrap = True
    tf.vertical_anchor = anchor
    for k, p in enumerate(paras if isinstance(paras, list) else [paras]):
        par = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
        par.alignment = align; par.space_after = Pt(6)
        segs = p if isinstance(p, tuple) else (p,)
        for seg in segs:
            b = bold
            if seg.startswith("**"):
                seg, b = seg.strip("*"), True
            parts = seg.split("₂")
            for j, part in enumerate(parts):
                if part:
                    r = par.add_run(); r.text = part
                    r.font.name = "Arial"; r.font.size = Pt(size); r.font.bold = b; r.font.color.rgb = color
                    if highlight and part.startswith("["):
                        r.font.color.rgb = DARK
                        from pptx.oxml.ns import qn as _qn
                        from lxml import etree
                        hl = etree.SubElement(r.font._rPr, _qn("a:highlight"))
                        etree.SubElement(hl, _qn("a:srgbClr")).set("val", "FFFF00")
                if j < len(parts) - 1:
                    r = par.add_run(); r.text = "2"; r.font.name = "Arial"; r.font.size = Pt(size)
                    r.font.bold = b; r.font.color.rgb = color
                    r.font._rPr.set("baseline", "-25000")
    return tb

def rect(slide, x, y, w, h, fill, shape=MSO_SHAPE.RECTANGLE):
    s = slide.shapes.add_shape(shape, x, y, w, h)
    s.fill.solid(); s.fill.fore_color.rgb = fill; s.line.fill.background(); s.shadow.inherit = False
    return s

def slide(title, kicker=None):
    s = prs.slides.add_slide(BLANK); NUM[0] += 1
    rect(s, 0, 0, W, Cm(0.35), GREEN)
    if kicker:
        text(s, Cm(1.5), Cm(0.9), Cm(25), Cm(1), kicker.upper(), size=13, color=GREEN, bold=True)
    text(s, Cm(1.5), Cm(1.6), Cm(30), Cm(2), title, size=30, color=DARK, bold=True)
    s.shapes.add_picture(f"{FIG}/logo.png", W - Cm(2.6), Hh - Cm(2.1), Cm(1.2), Cm(1.2))
    text(s, Cm(1.5), Hh - Cm(1.9), Cm(20), Cm(1), "EcoMove Querétaro · Cada viaje cuenta.", size=11, color=MUTED)
    text(s, W - Cm(5), Hh - Cm(1.9), Cm(2.2), Cm(1), str(NUM[0]), size=11, color=MUTED, align=PP_ALIGN.RIGHT)
    return s

def stat(s, x, y, w, value, label, color):
    rect(s, x, y, Cm(0.25), Cm(3.2), color)
    text(s, x + Cm(0.6), y - Cm(0.1), w, Cm(1.8), value, size=40, color=color, bold=True)
    text(s, x + Cm(0.6), y + Cm(1.7), w, Cm(2), label, size=15, color=INK)

def bullets(s, x, y, w, h, items, size=20):
    text(s, x, y, w, h, [("• ",) + (it if isinstance(it, tuple) else (it,)) for it in items], size=size)

def notes(s, t):
    s.notes_slide.notes_text_frame.text = t

# 1. Portada ----------------------------------------------------------------
s = prs.slides.add_slide(BLANK); NUM[0] += 1
rect(s, 0, 0, Cm(12), Hh, GREEN)
s.shapes.add_picture(f"{FIG}/logo.png", Cm(2.5), Cm(4.5), Cm(7), Cm(7))
text(s, Cm(1), Cm(12.5), Cm(10), Cm(1.5), "«Cada viaje cuenta.»", size=22, color=WHITE, align=PP_ALIGN.CENTER)
text(s, Cm(14), Cm(1.5), Cm(18), Cm(1.2), "[INSTITUCIÓN]", size=16, color=MUTED, highlight=True)
text(s, Cm(14), Cm(2.6), Cm(18), Cm(1.2), "[MATERIA] · [GRUPO]", size=16, color=MUTED, highlight=True)
text(s, Cm(14), Cm(5), Cm(18.5), Cm(4.5), ["ECOMOVE QUERÉTARO"], size=40, color=DARK, bold=True)
text(s, Cm(14), Cm(7.3), Cm(18.5), Cm(3), "Plataforma de movilidad sostenible con base de datos relacional y espacial",
     size=22, color=INK)
text(s, Cm(14), Cm(11.5), Cm(18.5), Cm(5),
     [("Profesora: ", "[NOMBRE DE LA PROFESORA]"), ("Integrantes: ", "[INTEGRANTES]"), ("[FECHA]",)],
     size=16, color=INK, highlight=True)
notes(s, "Portada. Llenar los marcadores antes de presentar.")

# 2. Problema ---------------------------------------------------------------
s = slide("Querétaro se mueve en auto y la ciclovía no llega a la mayoría", "El problema")
stat(s, Cm(1.5), Cm(5), Cm(9), "20.9 %", "de la población urbana vive a ≤ 300 m de una ciclovía", GREEN)
stat(s, Cm(12), Cm(5), Cm(9), "287 702", "personas en las zonas más densas sin ciclovía a ≤ 500 m", TEAL)
stat(s, Cm(22.5), Cm(5), Cm(9.5), "59–77 %", "de las viviendas de Querétaro, Corregidora y El Marqués tienen automóvil", BLUE)
text(s, Cm(1.5), Cm(11), Cm(30), Cm(4),
     ["Además, no hay datos abiertos de viajes: no se encontró una encuesta origen-destino ni un GTFS público.",
      "Sin demanda observada, no se puede decidir con datos dónde construir ciclovías y paradas."], size=20)
notes(s, "Cifras de ANALISIS_DATOS.md (INEGI, Censo 2020; OpenStreetMap, 2026).")

# 3. Datos: cobertura -----------------------------------------------------------
s = slide("Más de la mitad tiene parada cerca; solo una de cada cinco, ciclovía", "Los datos")
s.shapes.add_picture(f"{FIG}/g_cobertura.png", Cm(1.5), Cm(4), height=Cm(11.8))
bullets(s, Cm(24), Cm(4.5), Cm(8.5), Cm(11), [
    "608 AGEB urbanas, 1 407 630 habitantes",
    "Distancias en UTM 14N con PostGIS",
    "El Marqués: solo 26.4 % cerca de una parada",
    "Interpolación areal de la población"], size=17)
text(s, Cm(1.5), Cm(15.9), Cm(30), Cm(1), "Fuente: INEGI (2021a, 2021b); OpenStreetMap contributors (2026).", size=11, color=MUTED)

# 4. Datos: viviendas y ciclovía ------------------------------------------------
s = slide("Hay bicicletas en casa, pero la red ciclista es escasa", "Los datos")
s.shapes.add_picture(f"{FIG}/g_viviendas.png", Cm(1.2), Cm(4), width=Cm(15.5))
s.shapes.add_picture(f"{FIG}/g_ciclovia.png", Cm(17.2), Cm(4.5), width=Cm(15.5))
text(s, Cm(17.2), Cm(11.8), Cm(15.5), Cm(3), ["Querétaro: 1.59 km de ciclovía por cada 10 000 habitantes urbanos; "
     "Corregidora: 1.22 km."], size=17)
text(s, Cm(1.5), Cm(15.9), Cm(30), Cm(1), "Fuente: INEGI (2021b); OpenStreetMap contributors (2026).", size=11, color=MUTED)

# 5. Datasets -------------------------------------------------------------------
s = slide("Solo datos oficiales y abiertos", "Datasets")
rows = [("Dataset", "Fuente y licencia", "En la BD"),
        ("Marco Geoestadístico 2020", "INEGI · libre uso", "geo.mobility_zones (907 zonas)"),
        ("Censo de Población y Vivienda 2020", "INEGI · libre uso", "geo.zone_census"),
        ("Ciclovías y puntos de movilidad", "OpenStreetMap · ODbL 1.0", "924 ciclovías, 1 037 puntos"),
        ("Rendimiento de vehículos 2024", "U.S. EPA · dominio público", "vehicle_types")]
tbl = s.shapes.add_table(len(rows), 3, Cm(1.5), Cm(4.2), Cm(30.8), Cm(7)).table
for i, r in enumerate(rows):
    for j, v in enumerate(r):
        c = tbl.cell(i, j); c.text = v
        c.fill.solid(); c.fill.fore_color.rgb = DARK if i == 0 else (LIGHT if i % 2 else WHITE)
        for p in c.text_frame.paragraphs:
            for run in p.runs:
                run.font.name = "Arial"; run.font.size = Pt(17); run.font.bold = i == 0
                run.font.color.rgb = WHITE if i == 0 else INK
text(s, Cm(1.5), Cm(12.5), Cm(30), Cm(3),
     ["No obtenidos: encuesta origen-destino y GTFS de Qrobús. Los factores de emisión por medio se presentan "
      "como supuestos del prototipo."], size=17, color=MUTED)

# 6. Solución ---------------------------------------------------------------------
s = slide("EcoMove: registrar viajes para planear con demanda real", "La solución")
cards = [("App Android", "Registra el viaje con GPS y lo envía completo al terminar", GREEN),
         ("Web", "Mapa público, área privada y panel de administración", TEAL),
         ("API FastAPI", "Calcula distancia y CO₂, autoriza por rol", BLUE),
         ("PostgreSQL + PostGIS", "25 tablas en 3FN; única fuente de verdad", DARK)]
for k, (t, d, c) in enumerate(cards):
    x = Cm(1.5 + k * 7.8)
    rect(s, x, Cm(4.5), Cm(7.2), Cm(6), c, MSO_SHAPE.ROUNDED_RECTANGLE)
    text(s, x + Cm(0.4), Cm(4.9), Cm(6.4), Cm(1.5), t, size=20, color=WHITE, bold=True)
    text(s, x + Cm(0.4), Cm(6.6), Cm(6.4), Cm(3.8), d, size=16, color=WHITE)
text(s, Cm(1.5), Cm(11.5), Cm(30.5), Cm(4),
     [("**Objetivo: **", "que cada persona conozca el CO₂ que evita y que la ciudad cuente con viajes agregados y "
      "anónimos (k ≥ 5) para priorizar ciclovías y paradas.")], size=19)

# 7. ODS -------------------------------------------------------------------------
s = slide("Alineación con los ODS", "Impacto")
ods = [("9", "Industria, innovación e infraestructura", "Datos de demanda para invertir en infraestructura", RGBColor(0xFD, 0x69, 0x25)),
       ("11", "Ciudades y comunidades sostenibles", "Cobertura de paradas y ciclovías por población", RGBColor(0xFD, 0x9D, 0x24)),
       ("12", "Producción y consumo responsables", "CO₂ emitido y evitado por cada viaje", RGBColor(0xBF, 0x8B, 0x2E)),
       ("15", "Vida de ecosistemas terrestres", "Contribución indirecta: menos viajes en auto", RGBColor(0x56, 0xC0, 0x2B))]
for k, (n, t, d, c) in enumerate(ods):
    x = Cm(1.5 + k * 7.8)
    rect(s, x, Cm(4.5), Cm(7.2), Cm(2.4), c)
    text(s, x + Cm(0.3), Cm(4.6), Cm(6.6), Cm(2.2), f"ODS {n}", size=28, color=WHITE, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    text(s, x, Cm(7.3), Cm(7.2), Cm(2.4), t, size=16, color=INK, bold=True)
    text(s, x, Cm(9.7), Cm(7.2), Cm(4), d, size=16, color=MUTED)
text(s, Cm(1.5), Cm(15.9), Cm(30), Cm(1), "Colores oficiales de los ODS. Fuente: Naciones Unidas (2015).", size=11, color=MUTED)

# 8. MER ---------------------------------------------------------------------------
s = slide("Modelo entidad-relación: 25 tablas", "Base de datos")
s.shapes.add_picture(f"{FIG}/MER.png", Cm(1.2), Cm(4), width=Cm(31.4))
text(s, Cm(1.5), Cm(16.2), Cm(30), Cm(1), "PK, FK y UQ en cada tabla; pata de gallo = lado «muchos».", size=12, color=MUTED)

# 9. EER y normalización -----------------------------------------------------------
s = slide("EER y normalización hasta 3FN", "Base de datos")
s.shapes.add_picture(f"{FIG}/EER.png", Cm(1.2), Cm(3.9), height=Cm(12.6))
bullets(s, Cm(19.2), Cm(4.2), Cm(13.5), Cm(12), [
    "Especialización disjunta de POI: parada | estación de bici, garantizada con FK compuesta y CHECK",
    "Usuario: USER, ADMIN y SUPER_ADMIN",
    "JSONB con datos estructurados → tablas propias (1FN)",
    "Factores por tipo de auto con fuente (EPA)",
    "Argon2id, UUID, índices GiST, COMMENT ON"], size=16)

# 10. Consultas ----------------------------------------------------------------------
s = slide("Consultas SQL de ejemplo", "Base de datos")
bullets(s, Cm(1.5), Cm(4.2), Cm(13), Cm(11), [
    "JOIN de 3 o más tablas", "GROUP BY y HAVING (k-anonimato)", "Subconsultas: NOT EXISTS, IN",
    "CTE y funciones de ventana", "PostGIS: ST_DWithin, ST_Intersects", "Vista, índices y EXPLAIN",
    "CRUD con ROLLBACK"], size=18)
code = ("SELECT p.name, bs.capacity,\n  round(ST_Distance(p.location::geography,\n    zenea::geography)) AS metros\n"
        "FROM pois p\nJOIN bike_stations bs ON bs.poi_id = p.id\nWHERE ST_DWithin(p.location::geography,\n"
        "  zenea::geography, 800)\nORDER BY metros;")
box = rect(s, Cm(15), Cm(4.2), Cm(17.6), Cm(9.5), RGBColor(0xF3, 0xF4, 0xF6), MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, Cm(15.5), Cm(4.6), Cm(16.8), Cm(8.8), code.split("\n"), size=15, color=INK)
text(s, Cm(15), Cm(14), Cm(17.6), Cm(2), "Q13: estaciones de bicicleta a ≤ 800 m del Jardín Zenea "
     "(simplificada; zenea = punto de referencia).", size=13, color=MUTED)

# 11. Demo web ------------------------------------------------------------------------
s = slide("Demo web: CRUD conectado a la base de datos", "Prototipo")
shots = [("01-poi-crear-formulario.png", "Crear punto"), ("04-poi-editar-formulario.png", "Editar punto"),
         ("07-viaje-listar.png", "Listar viajes"), ("12-viaje-editar-resultado.png", "CO₂ recalculado")]
for k, (f, cap) in enumerate(shots):
    x = Cm(1.5 + (k % 2) * 15.6); y = Cm(3.9 + (k // 2) * 6.2)
    s.shapes.add_picture(EV + f, x, y, width=Cm(8.6))
    text(s, x + Cm(8.9), y + Cm(1.5), Cm(6), Cm(2), cap, size=17, color=DARK, bold=True)
text(s, Cm(1.5), Cm(16.2), Cm(30), Cm(1), "Datos ficticios (@ejemplo.mx). Cada operación verificada con verificacion.sql.",
     size=12, color=MUTED)

# 12. Demo APK -------------------------------------------------------------------------
s = slide("Demo Android: registrar un viaje", "Prototipo")
bullets(s, Cm(1.5), Cm(4.2), Cm(17), Cm(11), [
    "Iniciar sesión", "Buscar origen y destino por nombre", "Elegir medio, tipo de auto y ocupantes",
    "Ver el impacto estimado de cada medio", "Registrar el viaje con GPS", "Revisar CO₂ evitado y logros"], size=19)
ph = rect(s, Cm(21), Cm(4), Cm(9), Cm(11.5), LIGHT, MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, Cm(21), Cm(4), Cm(9), Cm(11.5), "[CAPTURA DEL APK O DEMOSTRACIÓN EN VIVO]", size=16, color=DARK,
     bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
notes(s, "El repositorio no incluye capturas del APK: insertar una o hacer la demostración en vivo.")

# 13. Viabilidad e impacto ---------------------------------------------------------------
s = slide("Viable con software y datos abiertos", "Viabilidad e impacto")
cols = [("Técnica", ["Tecnologías maduras de código abierto", "BD normalizada y documentada", "API escalable horizontalmente"], GREEN),
        ("Económica", ["0 en licencias y datos", "Nube, mapas y Play Store: [POR CONFIRMAR]", "Convenios y patrocinios posibles"], TEAL),
        ("Social", ["Gratuita y voluntaria", "Exportar y borrar datos", "Barrera: baja adopción inicial"], BLUE)]
for k, (t, items, c) in enumerate(cols):
    x = Cm(1.5 + k * 10.5)
    rect(s, x, Cm(4.3), Cm(9.8), Cm(0.3), c)
    text(s, x, Cm(4.8), Cm(9.8), Cm(1.4), t, size=22, color=c, bold=True)
    bullets(s, x, Cm(6.4), Cm(9.8), Cm(8), items, size=16)
text(s, Cm(1.5), Cm(13.6), Cm(30.5), Cm(2.4), "Impacto en la industria: datos de demanda donde hoy no existen y un modelo "
     "replicable en otras ciudades con datos del INEGI y de OSM.", size=17)

# 14. Conclusiones ------------------------------------------------------------------------
s = slide("Conclusiones", "Cierre")
bullets(s, Cm(1.5), Cm(4.2), Cm(30.5), Cm(10), [
    "La necesidad está demostrada con datos oficiales: poca ciclovía cerca, mucho automóvil y ningún dato abierto de viajes.",
    "La BD de 25 tablas en 3FN, con especializaciones e integridad garantizadas por restricciones, sostiene el prototipo.",
    "El CRUD funciona y se verificó en la base de datos.",
    "Siguiente paso: más usuarios, factores de emisión con fuente oficial y contraste de OSM con inventarios oficiales."], size=19)
text(s, Cm(1.5), Cm(14.2), Cm(30.5), Cm(1.6), "¡Gracias! ¿Preguntas?", size=28, color=GREEN, bold=True)

prs.save(OUT)
print("diapositivas:", len(prs.slides))
