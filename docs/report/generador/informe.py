"""Genera Informe_EcoMove.docx con el formato del proyecto ABD (REQUISITOS_ABD.md §2).

Uso (desde la raíz del repositorio):
    python informe.py <carpeta_figuras> <salida.docx> [paginas.json]

paginas.json (opcional) trae los números de página de cada entrada de los índices;
lo produce build.sh en una primera pasada a partir del PDF.
"""
import json, re, sys
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT, WD_TAB_LEADER, WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

FIG = sys.argv[1]
OUT = sys.argv[2]
PAGES = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
EV = "docs/report/evidencias/"
FONT = "Arial"
BLACK = RGBColor(0, 0, 0)

doc = Document()

# ---------------------------------------------------------------- estilos
def set_fonts(rpr_owner):
    rpr = rpr_owner.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts"); rpr.insert(0, rf)
    for a in list(rf.attrib):
        del rf.attrib[a]
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rf.set(qn(a), FONT)

def style(name, size, bold=False, italic=False):
    st = doc.styles[name]
    st.font.name = FONT; st.font.size = Pt(size); st.font.bold = bold; st.font.italic = italic
    st.font.color.rgb = BLACK; st.font.all_caps = False
    set_fonts(st.element)
    pf = st.paragraph_format
    pf.line_spacing = 1.15
    return st

normal = style("Normal", 12)
# fuente por defecto del documento y de todos los estilos: Arial (sin fuentes de tema)
for rf in doc.styles.element.iter(qn("w:rFonts")):
    for a in list(rf.attrib):
        del rf.attrib[a]
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rf.set(qn(a), FONT)
_l = OxmlElement("w:lang"); _l.set(qn("w:val"), "es-MX"); _l.set(qn("w:eastAsia"), "es-MX"); normal.element.get_or_add_rPr().append(_l)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
for lvl, (size, bold) in {1: (14, False), 2: (12, True), 3: (12, True)}.items():
    h = style(f"Heading {lvl}", size, bold)
    h.paragraph_format.space_before = Pt(12); h.paragraph_format.space_after = Pt(6)
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    # quitar el color de tema del estilo
    for c in h.element.rPr.findall(qn("w:color")):
        c.attrib.pop(qn("w:themeColor"), None); c.attrib.pop(qn("w:themeShade"), None)
for name in ("List Bullet", "Caption"):
    style(name, 12)
doc.styles["Caption"].paragraph_format.space_after = Pt(6)

sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.59), Cm(27.94)
for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
    setattr(sec, side, Cm(2))
sec.footer_distance = Cm(1); sec.header_distance = Cm(1)
TEXT_W = 21.59 - 4

def fld(par, instr, cached="1"):
    """Campo simple de Word (PAGE, SEQ) con resultado en caché."""
    r = par.add_run(); b = OxmlElement("w:fldChar"); b.set(qn("w:fldCharType"), "begin"); r._r.append(b)
    r = par.add_run(); t = OxmlElement("w:instrText"); t.set(qn("xml:space"), "preserve"); t.text = f" {instr} "; r._r.append(t)
    r = par.add_run(); s = OxmlElement("w:fldChar"); s.set(qn("w:fldCharType"), "separate"); r._r.append(s)
    out = par.add_run(cached)
    r = par.add_run(); e = OxmlElement("w:fldChar"); e.set(qn("w:fldCharType"), "end"); r._r.append(e)
    return out

# pie de página: número abajo a la derecha (la portada no lo muestra)
sec.different_first_page_header_footer = True
fp = sec.footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
fld(fp, "PAGE")

# ---------------------------------------------------------------- texto
TOKEN = re.compile(r"(\*\*.+?\*\*|\*.+?\*|`.+?`)")

def runs(par, text, bold=False, italic=False, size=None, highlight=False):
    for piece in TOKEN.split(text):
        if not piece:
            continue
        b, i = bold, italic
        if piece.startswith("**"):
            piece, b = piece[2:-2], True
        elif piece.startswith("`"):
            piece = piece[1:-1]          # identificadores en redonda
        elif piece.startswith("*"):
            piece, i = piece[1:-1], True
        # CO₂: Arial no tiene el subíndice Unicode; se usa formato de subíndice
        parts = piece.split("₂")
        for k, part in enumerate(parts):
            if part:
                r = par.add_run(part); r.bold = b; r.italic = i
                if size: r.font.size = Pt(size)
                if highlight: r.font.highlight_color = WD_COLOR_INDEX.YELLOW
            if k < len(parts) - 1:
                r = par.add_run("2"); r.font.subscript = True; r.bold = b; r.italic = i
                if size: r.font.size = Pt(size)
    return par

def P(text, align=None, **kw):
    p = runs(doc.add_paragraph(), text, **kw)
    if align is not None:
        p.alignment = align
    return p

def BUL(items):
    # viñeta escrita en Arial (sin fuente de símbolos) con sangría francesa
    for it in items:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.9); p.paragraph_format.first_line_indent = Cm(-0.5)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(0.9))
        p.add_run("•\t"); runs(p, it)

TOC, TABS, FIGS = [], [], []

def H(level, text):
    doc.add_heading(text, level)
    TOC.append((level, text))

def page_break():
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

def caption(kind, title):
    lst = TABS if kind == "Tabla" else FIGS
    n = len(lst) + 1
    lst.append(f"{kind} {n}. {title}")
    p = doc.add_paragraph(style="Caption")
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.add_run(f"{kind} ")
    fld(p, f"SEQ {kind} \\* ARABIC", str(n))
    p.add_run(". ")
    runs(p, title, italic=True)
    return n

def nota(text):
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(10)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    runs(p, "Nota. ", italic=True); runs(p, text)

def shade(cell, color):
    tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear"); sh.set(qn("w:color"), "auto"); sh.set(qn("w:fill"), color); tcPr.append(sh)

def TABLE(title, header, rows, note=None, widths=None, align_num=True):
    caption("Tabla", title)
    t = doc.add_table(rows=1, cols=len(header)); t.style = "Table Grid"; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for j, h in enumerate(header):
        c = t.rows[0].cells[j]; c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
        runs(c.paragraphs[0], h, bold=True); shade(c, "DCFCE7")
    # repetir encabezado en cada página
    trPr = t.rows[0]._tr.get_or_add_trPr(); th = OxmlElement("w:tblHeader"); th.set(qn("w:val"), "true"); trPr.append(th)
    for row in rows:
        cells = t.add_row().cells
        for j, v in enumerate(row):
            lines = v if isinstance(v, list) else [v]
            par = cells[j].paragraphs[0]
            for k, line in enumerate(lines):
                if k:
                    par = cells[j].add_paragraph()
                par.paragraph_format.space_after = Pt(0); par.paragraph_format.line_spacing = 1.15
                par.alignment = (WD_ALIGN_PARAGRAPH.RIGHT if align_num and re.fullmatch(r"[\d  .,%*()-]+", line) and j
                                 else WD_ALIGN_PARAGRAPH.LEFT)
                runs(par, line)
    for row in t.rows:
        trPr = row._tr.get_or_add_trPr(); cs = OxmlElement("w:cantSplit"); cs.set(qn("w:val"), "true"); trPr.append(cs)
    for c in t.rows[0].cells:
        c.paragraphs[0].paragraph_format.line_spacing = 1.15; c.paragraphs[0].paragraph_format.space_after = Pt(0)
    if widths:
        t.autofit = False
        tblPr = t._tbl.tblPr; lay = OxmlElement("w:tblLayout"); lay.set(qn("w:type"), "fixed"); tblPr.append(lay)
        for j, gc in enumerate(t._tbl.tblGrid.findall(qn("w:gridCol"))):
            gc.set(qn("w:w"), str(int(widths[j] * 567)))
        for row in t.rows:
            for j, w in enumerate(widths):
                row.cells[j].width = Cm(w)
    if note:
        nota(note)
    else:
        doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return t

def FIGURE(path, title, width_cm=None, height_cm=None, note=None):
    caption("Figura", title)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = bool(note)
    kw = {}
    if width_cm: kw["width"] = Cm(width_cm)
    if height_cm: kw["height"] = Cm(height_cm)
    p.add_run().add_picture(path, **kw)
    if note:
        nota(note)

def CODE(text):
    t = doc.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.rows[0].cells[0]; shade(c, "F3F4F6")
    lines = text.strip("\n").split("\n")
    par = c.paragraphs[0]
    for k, line in enumerate(lines):
        if k:
            par = c.add_paragraph()
        par.alignment = WD_ALIGN_PARAGRAPH.LEFT
        par.paragraph_format.space_after = Pt(0); par.paragraph_format.line_spacing = 1.15
        lead = len(line) - len(line.lstrip(" "))
        par.paragraph_format.left_indent = Cm(0.25 * lead)
        par.add_run(line.lstrip(" "))
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

def new_section(landscape):
    s = doc.add_section(WD_SECTION.NEW_PAGE)
    s.different_first_page_header_footer = False
    if landscape:
        s.orientation = WD_ORIENT.LANDSCAPE; s.page_width, s.page_height = Cm(27.94), Cm(21.59)
    else:
        s.orientation = WD_ORIENT.PORTRAIT; s.page_width, s.page_height = Cm(21.59), Cm(27.94)
    return s

# ---------------------------------------------------------------- portada
def cover_line(text, space_before=0, **kw):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(space_before)
    runs(p, text, **kw)
    return p

cover_line("[INSTITUCIÓN]", highlight=True)
cover_line("[MATERIA]", 12, highlight=True)
p = cover_line("ECOMOVE QUERÉTARO: PLATAFORMA DE MOVILIDAD SOSTENIBLE CON BASE DE DATOS RELACIONAL Y ESPACIAL",
               150, bold=True, size=14)
cover_line("Informe del proyecto final", 12)
cover_line("«Cada viaje cuenta.»", 6)
pp = doc.add_paragraph(); pp.alignment = WD_ALIGN_PARAGRAPH.CENTER; pp.paragraph_format.space_before = Pt(150)
runs(pp, "Profesora: "); runs(pp, "[NOMBRE DE LA PROFESORA]", highlight=True)
pp = doc.add_paragraph(); pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
runs(pp, "Integrantes: "); runs(pp, "[INTEGRANTES]", highlight=True)
pp = doc.add_paragraph(); pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
runs(pp, "Grupo: "); runs(pp, "[GRUPO]", highlight=True)
cover_line("Querétaro, Qro., [FECHA]", 24)
page_break()

# ---------------------------------------------------------------- índices
INDEX_SLOTS = {}

def index_block(title, key):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(12)
    runs(p, title, size=14)
    INDEX_SLOTS[key] = p  # las entradas se insertan después de construir el cuerpo

index_block("ÍNDICE GENERAL", "toc"); page_break()
index_block("ÍNDICE DE TABLAS", "tab")
index_block("ÍNDICE DE FIGURAS", "fig"); page_break()

# ================================================================ CUERPO
H(1, "1. INTRODUCCIÓN")
P("La movilidad urbana es uno de los principales retos de la zona metropolitana de Querétaro. El crecimiento "
  "de la población y la alta tenencia de automóviles incrementan las emisiones de dióxido de carbono (CO₂) y "
  "la presión sobre la infraestructura vial, mientras que la red de ciclovías y de transporte público no "
  "cubre de manera uniforme a la población urbana. Para planear nuevas ciclovías y paradas se necesitan datos "
  "de viajes reales; sin embargo, no se encontró una encuesta origen-destino ni un registro público de rutas "
  "y frecuencias del transporte público que puedan descargarse con licencia de uso.")
P("El presente informe documenta **EcoMove Querétaro**, una plataforma de movilidad sostenible desarrollada "
  "como proyecto final de la materia de Administración de Bases de Datos. El sistema permite a los ciudadanos "
  "registrar sus viajes, conocer el CO₂ que evitan al elegir medios sostenibles y consultar la infraestructura "
  "cercana; a la administración le ofrece indicadores agregados y anónimos para priorizar intervenciones. El "
  "núcleo del proyecto es una base de datos PostgreSQL con la extensión espacial PostGIS, compuesta por 25 "
  "tablas normalizadas hasta la tercera forma normal.")
P("El documento se organiza de la siguiente manera. En el desarrollo se presenta la necesidad identificada a "
  "partir del análisis de datos oficiales del Instituto Nacional de Estadística y Geografía (INEGI) y de "
  "OpenStreetMap; los conjuntos de datos utilizados; el objetivo del software y su alineación con los "
  "Objetivos de Desarrollo Sostenible (ODS) 9, 11, 12 y 15; la identidad del proyecto; el diseño de la base "
  "de datos (modelo entidad-relación, modelo entidad-relación extendido, normalización y diccionario de "
  "datos); ejemplos de consultas SQL; el prototipo funcional con las evidencias de sus operaciones CRUD; las "
  "estadísticas obtenidas; la viabilidad técnica, económica y social; el impacto en la industria y en los "
  "ODS; las historias de usuario y las limitaciones. Por último, se exponen las conclusiones y las "
  "referencias consultadas.")

H(1, "2. DESARROLLO")

# ---------------------------------------------------------------- 2.1
H(2, "2.1 Necesidad identificada a partir de los datos")
P("Para identificar la necesidad se planteó la siguiente pregunta: ¿la población urbana de la zona "
  "metropolitana de Querétaro tiene acceso cercano a infraestructura de movilidad sostenible y dónde se "
  "concentra la población sin ese acceso? Se cruzaron la población por área geoestadística básica (AGEB) "
  "urbana del Censo de Población y Vivienda 2020 (INEGI, 2021b), sus límites geográficos (INEGI, 2021a) y las "
  "paradas de autobús y ciclovías registradas en OpenStreetMap (OpenStreetMap contributors, 2026).")
P("El área de estudio comprende las 608 AGEB urbanas contenidas por completo en el área importada de "
  "OpenStreetMap. Las distancias se calcularon en la proyección UTM zona 14 norte (EPSG:32614). Como criterios "
  "de análisis, y no como normas oficiales, se consideraron 400 m a una parada de autobús (unos cinco minutos "
  "a pie) y 300 m a una ciclovía. La población cubierta se estimó por interpolación areal: población de la "
  "AGEB multiplicada por la fracción de su área que queda dentro de la zona de influencia. Como control de "
  "calidad, la población de los 18 municipios cargados suma 2 368 467 habitantes, igual al total estatal "
  "publicado por el INEGI.")
TABLE("Población urbana del área de estudio por municipio",
      ["Municipio", "AGEB urbanas", "Población urbana", "Área (km²)", "Densidad (hab/km²)"],
      [["Querétaro", "427", "996 222", "167.5", "5 946"],
       ["Corregidora", "85", "192 192", "38.2", "5 035"],
       ["El Marqués", "77", "177 073", "33.1", "5 348"],
       ["Pedro Escobedo", "14", "27 934", "5.8", "4 858"],
       ["Huimilpan", "3", "8 095", "2.4", "3 361"],
       ["Colón", "2", "6 114", "1.0", "5 835"],
       ["**Total**", "**608**", "**1 407 630**", "**248.0**", "**5 676**"]],
      "Elaboración propia con datos de INEGI (2021a, 2021b). Pedro Escobedo, Huimilpan y Colón solo tienen "
      "una parte de su territorio dentro del área de estudio; por ello, las conclusiones se centran en "
      "Querétaro, Corregidora y El Marqués.")
TABLE("Población urbana con acceso cercano a paradas de autobús y a ciclovías",
      ["Municipio", "Población urbana", "A ≤ 400 m de parada", "%", "A ≤ 300 m de ciclovía", "%"],
      [["**Área de estudio**", "**1 407 630**", "**819 611**", "**58.2**", "**294 062**", "**20.9**"],
       ["Querétaro", "996 222", "662 189", "66.5", "226 783", "22.8"],
       ["Corregidora", "192 192", "109 516", "57.0", "27 651", "14.4"],
       ["El Marqués", "177 073", "46 753", "26.4", "37 805", "21.4"],
       ["Pedro Escobedo", "27 934", "0", "0.0", "0", "0.0"],
       ["Huimilpan", "8 095", "1 152", "14.2", "1 823", "22.5"],
       ["Colón", "6 114", "0", "0.0", "0", "0.0"]],
      "Elaboración propia con datos de INEGI (2021a, 2021b) y OpenStreetMap contributors (2026). Los ceros "
      "de Pedro Escobedo y Colón reflejan probablemente datos faltantes en OpenStreetMap y no la ausencia de "
      "infraestructura.")
TABLE("Viviendas particulares habitadas con bicicleta, automóvil y motocicleta",
      ["Municipio", "Viviendas", "% con bicicleta", "% con automóvil", "% con motocicleta"],
      [["Querétaro", "305 361", "15.2", "62.9", "8.1"],
       ["El Marqués", "67 957", "18.8", "58.5", "6.8"],
       ["Corregidora", "64 356", "15.9", "76.6", "8.5"],
       ["Pedro Escobedo", "19 072", "30.0", "47.0", "5.3"],
       ["Huimilpan", "9 905", "11.5", "55.9", "7.0"]],
      "Elaboración propia con datos de INEGI (2021b), total municipal.")
TABLE("AGEB densas sin ciclovía cercana",
      ["Umbral de densidad (percentil 75)", "AGEB densas", "Población", "AGEB sin ciclovía a ≤ 500 m",
       "Población sin ciclovía a ≤ 500 m"],
      [["11 913 hab/km²", "151", "481 392", "97 (64 %)", "287 702 (60 %)"]],
      "Elaboración propia con datos de INEGI (2021a, 2021b) y OpenStreetMap contributors (2026).")
P("Los resultados permiten establecer cuatro hallazgos:")
BUL(["**El transporte público cubre a más de la mitad de la población urbana, pero de forma desigual.** El "
     "58.2 % vive a 400 m o menos de una parada; en Querétaro la cifra sube a 66.5 % y en El Marqués baja a "
     "26.4 %, aunque su área urbana tiene una densidad similar (5 348 hab/km²).",
     "**La ciclovía cercana es la excepción.** Solo el 20.9 % de la población urbana vive a 300 m o menos de "
     "una ciclovía.",
     "**El déficit se concentra en las zonas más densas.** De las 151 AGEB del cuartil más denso, 97 no "
     "tienen ciclovía a 500 m o menos; en ellas viven 287 702 personas, y casi todas cuentan con una parada "
     "a menos de 600 m, lo que las hace candidatas a la intermodalidad bicicleta y autobús.",
     "**Existe una demanda latente de bicicleta y una alta dependencia del automóvil.** Entre el 15.2 % y el "
     "18.8 % de las viviendas de Querétaro, Corregidora y El Marqués tienen bicicleta, y entre el 58.5 % y el "
     "76.6 % tienen automóvil."])
P("**Necesidad identificada.** La zona metropolitana de Querétaro tiene una oferta de ciclovías baja y "
  "desigual frente a su población urbana y una alta tenencia de automóvil. Además, no existen datos abiertos "
  "de viajes reales que permitan priorizar dónde intervenir. Esto justifica un software que registre viajes "
  "voluntarios con su medio y su ruta, estime el CO₂ evitado y agregue esos viajes de forma anónima, para "
  "que la planeación de ciclovías y paradas se apoye en la demanda observada y no solo en la población.")

# ---------------------------------------------------------------- 2.2
H(2, "2.2 Conjuntos de datos utilizados")
P("El proyecto sigue la regla de usar únicamente datos reales cuando están disponibles y su licencia lo "
  "permite. Los datos de prueba se marcan como DEMO y nunca se mezclan con los oficiales. La Tabla 5 resume "
  "los conjuntos de datos empleados y su destino en la base de datos.")
TABLE("Conjuntos de datos del proyecto",
      ["Conjunto de datos", "Institución y licencia", "Destino en la BD", "Estado"],
      [["Marco Geoestadístico 2020, Querétaro (AGEB urbanas y municipios)", "INEGI; libre uso",
        "`geo.mobility_zones`", "18 municipios y 889 AGEB urbanas"],
       ["Censo de Población y Vivienda 2020 por AGEB urbana", "INEGI; libre uso", "`geo.zone_census`",
        "907 filas"],
       ["Ciclovías y puntos de movilidad (extracción del 16/11/2026)", "OpenStreetMap; ODbL 1.0",
        "`cycleways`, `pois`, `transit_stops`, `bike_stations`", "924 ciclovías y 1 037 puntos"],
       ["Rendimiento real de vehículos ligeros, año modelo 2024", "U.S. EPA; dominio público",
        "`vehicle_types`", "Aplicado"],
       ["Factores de emisión por medio de transporte", "Sin fuente oficial trazable", "`emission_factors`",
        "Supuestos del prototipo"],
       ["Encuesta origen-destino o datos del transporte público", "Gobierno del Estado de Querétaro", "—",
        "No obtenido"]],
      "Elaboración propia. Fuentes: INEGI (2021a, 2021b), OpenStreetMap contributors (2026) y U.S. "
      "Environmental Protection Agency (2026).")
P("Los puntos de interés de OpenStreetMap se distribuyen en 890 paradas de autobús, 89 estacionamientos de "
  "bicicletas, 41 estaciones de bicicleta compartida, 11 estaciones de reparación y 6 cargadores de "
  "vehículos eléctricos. Los factores de emisión por tipo de automóvil se obtuvieron del rendimiento real "
  "publicado por la Agencia de Protección Ambiental de los Estados Unidos (U.S. Environmental Protection "
  "Agency, 2026), convertido con el factor de 8 887 g de CO₂ por galón de gasolina (U.S. Environmental "
  "Protection Agency, 2023): sedán, 174 g/km; SUV, 224 g/km; minivan, 217 g/km, y pickup, 272 g/km.")

# ---------------------------------------------------------------- 2.3
H(2, "2.3 Objetivo del software y alineación con los ODS")
P("**Objetivo general.** Desarrollar una plataforma web y móvil, respaldada por una base de datos relacional "
  "y espacial, que permita a los habitantes de la zona metropolitana de Querétaro registrar sus viajes, "
  "conocer el CO₂ que evitan al elegir medios sostenibles y consultar la infraestructura de movilidad, y que "
  "ofrezca a la administración indicadores agregados y anónimos para planear ciclovías y paradas a partir de "
  "la demanda observada.")
P("**Objetivos específicos:**")
BUL(["Registrar viajes con su medio de transporte, ruta y ocupantes, y calcular en el servidor la distancia, "
     "el CO₂ emitido y el CO₂ evitado con factores versionados y con fuente.",
     "Integrar datos oficiales y abiertos del INEGI y de OpenStreetMap para identificar zonas con déficit de "
     "infraestructura.",
     "Mostrar en un mapa las paradas, las ciclovías y las estaciones de bicicleta.",
     "Ofrecer estadísticas personales y de la ciudad que protejan la privacidad mediante k-anonimato.",
     "Permitir a los administradores mantener la infraestructura, atender reportes ciudadanos y generar "
     "informes, con una bitácora de auditoría."])
P("En relación con la industria, el software pertenece al sector de tecnologías para la movilidad urbana y "
  "las ciudades inteligentes, en el que gobiernos y operadores de transporte requieren datos de viajes para "
  "planear infraestructura. La Tabla 6 muestra la alineación con los ODS de la Agenda 2030 (Naciones Unidas, "
  "2015).")
TABLE("Alineación del software con los Objetivos de Desarrollo Sostenible",
      ["ODS y meta", "Contribución de EcoMove", "Evidencia en el sistema"],
      [["9. Industria, innovación e infraestructura (meta 9.1)",
        "Genera datos de demanda observada para priorizar la inversión en ciclovías y paradas, e integra datos "
        "abiertos en una plataforma reutilizable", "`trips`, `cycleways`, `pois`, `geo.mobility_zones`"],
       ["11. Ciudades y comunidades sostenibles (metas 11.2 y 11.6)",
        "Muestra la infraestructura cercana, mide la cobertura por población y recibe reportes ciudadanos",
        "Mapa público, `citizen_reports`, Tablas 2 y 4"],
       ["12. Producción y consumo responsables (meta 12.8)",
        "Informa a cada persona el CO₂ emitido y evitado; los logros refuerzan hábitos de movilidad responsable",
        "`emission_factors`, `vehicle_types`, `achievements`"],
       ["15. Vida de ecosistemas terrestres (metas 15.1 y 15.5)",
        "Contribución indirecta: menos viajes en automóvil reducen la presión ambiental sobre los ecosistemas "
        "periurbanos", "Indicador de CO₂ evitado"]],
      "Elaboración propia con base en Naciones Unidas (2015). La relación con el ODS 15 es indirecta, ya que "
      "el sistema no mide biodiversidad ni uso de suelo.", align_num=False)

# ---------------------------------------------------------------- 2.4
H(2, "2.4 Identidad del proyecto: nombre, logotipo, eslogan y colores")
P("El proyecto se denomina **EcoMove Querétaro** (forma corta: EcoMove). Su eslogan es «Cada viaje cuenta.», "
  "que expresa que cada trayecto registrado suma al CO₂ evitado y a los datos para planear la ciudad. El "
  "logotipo representa una hoja que se convierte en trayecto, en blanco sobre un cuadrado redondeado verde "
  "(Figura 1).")
FIGURE(f"{FIG}/logo.png", "Logotipo de EcoMove Querétaro", width_cm=4, note="Elaboración propia.")
TABLE("Paleta de colores de la marca",
      ["Color", "Código", "Uso"],
      [["Verde", "#16A34A", "Acción principal, iconos y CO₂ evitado"],
       ["Verde oscuro", "#14532D", "Texto verde y enlaces"],
       ["Verde claro", "#DCFCE7", "Fondos de mensajes positivos"],
       ["Turquesa", "#0D9488", "Acento y micromovilidad"],
       ["Azul", "#2563EB", "Transporte público e información"],
       ["Amarillo", "#EAB308", "Advertencias (solo como relleno)"]],
      "Elaboración propia. La interfaz usa la tipografía Inter; el contraste mínimo del texto es de 4.5:1.",
      align_num=False)

# ---------------------------------------------------------------- 2.5
H(2, "2.5 Diseño de la base de datos")
P("La base de datos se implementó en PostgreSQL 16 con PostGIS 3.4. Se modeló primero con el enfoque "
  "entidad-relación propuesto por Chen (1976) y después se transformó al modelo relacional (Codd, 1970). Las "
  "buenas prácticas aplicadas son las siguientes:")
BUL(["Claves sustitutas UUID versión 4 y restricciones de unicidad sobre las claves naturales (correo, "
     "código, identificador de OpenStreetMap).",
     "Claves foráneas con acciones explícitas (`CASCADE`, `SET NULL` o `RESTRICT`).",
     "Restricciones `CHECK` de dominio, como rangos, formatos y la regla de que un viaje en auto compartido "
     "tenga al menos dos ocupantes.",
     "Fechas con zona horaria en UTC y geometrías en el sistema de referencia 4326 con índices espaciales GiST.",
     "Contraseñas guardadas solo como hash Argon2id y tokens como hash SHA-256.",
     "Comentarios (`COMMENT ON`) en cada tabla y columna."])
P("Los scripts entregados son `01_esquema.sql` (creación de la base de datos), `02_datos_ejemplo.sql` (datos "
  "de ejemplo ficticios), `03_consultas.sql` y `04_consultas_espaciales.sql` (consultas de ejemplo).")

new_section(landscape=True)
H(3, "2.5.1 Modelo entidad-relación (MER)")
P("La Figura 2 presenta el modelo relacional con las 25 tablas, sus claves primarias (PK), foráneas (FK) y "
  "únicas (UQ), y la cardinalidad de cada relación en notación de pata de gallo.")
FIGURE(f"{FIG}/MER.png", "Modelo entidad-relación de EcoMove Querétaro", width_cm=23.9,
       note="Elaboración propia, generado a partir del catálogo de la base de datos.")
new_section(landscape=True)
H(3, "2.5.2 Modelo entidad-relación extendido (EER)")
P("La Figura 3 muestra el modelo EER en notación de Chen, con las especializaciones, entidades débiles y "
  "atributos derivados.")
FIGURE(f"{FIG}/EER.png", "Modelo entidad-relación extendido de EcoMove Querétaro", height_cm=13.2,
       note="Elaboración propia, en notación de Chen (1976).")
new_section(landscape=False)
P("Los elementos principales del modelo EER son:")
BUL(["**Especialización de punto de interés:** disjunta y parcial, discriminada por la categoría. Sus "
     "subtipos son parada de autobús (`transit_stops`) y estación de bicicleta (`bike_stations`); los "
     "cargadores eléctricos y las estaciones de reparación no tienen subtipo.",
     "**Especialización de usuario:** disjunta y total, discriminada por el rol: ciudadano (USER), "
     "administrador (ADMIN) y superadministrador (SUPER_ADMIN). Se implementa con una sola tabla y el "
     "discriminador `role`, porque los subtipos no tienen atributos propios; solo difieren en las relaciones "
     "en que participan y en sus permisos.",
     "**Entidades débiles:** sesión (`refresh_tokens`), preferencias (1:1 con usuario), factor de emisión "
     "(1:1 con medio de transporte) y censo (`geo.zone_census`), que depende de la zona.",
     "**Relaciones N:M:** usuario–logro, rol–permiso y parada–línea.",
     "**Atributos derivados:** distancia, CO₂ evitado y puntos del viaje, y área de la zona."])
P("La disyunción de la especialización se garantiza en la propia base de datos: la tabla `pois` declara la "
  "restricción única `(id, category)`, cada subtipo la referencia con una clave foránea compuesta y tiene un "
  "`CHECK` sobre la categoría. Así, un punto no puede pertenecer a los dos subtipos ni a un subtipo que no "
  "corresponda a su categoría.")

H(3, "2.5.3 Normalización hasta la tercera forma normal")
P("Para cada tabla se identificaron las claves candidatas y las dependencias funcionales no triviales, y se "
  "comprobó cada forma normal según las definiciones de Elmasri y Navathe (2016): en la primera forma normal "
  "(1FN), los dominios son atómicos y no hay grupos repetitivos; en la segunda (2FN), ningún atributo no "
  "primo depende de una parte de una clave compuesta, y en la tercera (3FN), ningún atributo no primo "
  "depende transitivamente de la clave. Las 25 tablas cumplen la 3FN, y la mayoría también la forma normal "
  "de Boyce-Codd. La Tabla 8 resume los cambios aplicados al diseño inicial.")
TABLE("Cambios de normalización aplicados",
      ["Diseño inicial", "Problema", "Solución"],
      [["`users.preferences` como JSONB", "Violaba la 1FN: atributo compuesto no atómico, sin posibilidad de "
        "declarar CHECK ni FK por campo", "Tabla `user_preferences` (1:1, PK = FK a `users`)"],
       ["`pois.attributes.code` y `attributes.lines`", "Violaba la 1FN: `lines` era un grupo repetitivo y "
        "`code` solo aplicaba a algunas categorías", "Especialización: `transit_stops`, `bike_stations`, "
        "`transit_lines` y la tabla N:M `stop_lines`"],
       ["`pois.attributes.capacity`", "Dependía del subtipo y no del punto de interés",
        "`bike_stations.capacity` con CHECK de 1 a 10 000"],
       ["Rol y medio de transporte solo como ENUM", "Relaciones implícitas con los catálogos",
        "Claves foráneas a `roles` y `transport_modes`"],
       ["Un solo factor para el automóvil", "El factor depende del tipo de vehículo, que no se modelaba",
        "Tabla `vehicle_types` con fuente citada"]],
      "Elaboración propia.", align_num=False)
TABLE("Dependencias funcionales de tablas representativas",
      ["Tabla", "Clave", "Dependencias funcionales y justificación"],
      [["`users`", "PK `id`; clave candidata `email`", "`id` → datos de la cuenta; `email` → `id`. Ambos "
        "determinantes son claves, por lo que cumple la forma normal de Boyce-Codd"],
       ["`trips`", "PK `id`", "`id` → medio, fechas, ruta, distancia, factor aplicado, CO₂ y puntos. El factor "
        "se guarda como hecho del viaje para conservar el histórico, por lo que no hay dependencia transitiva"],
       ["`user_achievements`", "Clave candidata `(user_id, achievement_id)`", "Los puntos de bono se congelan "
        "al otorgar el logro; dependen de la clave completa"],
       ["`transit_stops`", "PK `poi_id`; clave candidata `code`", "`poi_id` → categoría, código y referencia "
        "de OpenStreetMap"],
       ["`geo.zone_census`", "PK `(zone_code, source)`", "La población y las viviendas dependen de la clave "
        "completa: otro levantamiento tendría otros valores (cumple la 2FN)"]],
      "Elaboración propia.", align_num=False)
P("Se mantienen como excepciones justificadas tres columnas JSONB (`audit_logs.payload`, "
  "`notifications.data` y `reports.parameters`), porque guardan registros semiestructurados e inmutables que "
  "no se consultan por sus campos, y la columna `pois.attributes`, que solo conserva metadatos de procedencia. "
  "También se acepta una desnormalización controlada en `refresh_tokens`, que repite la fecha de creación de "
  "la sesión para evitar una reunión adicional en cada petición autenticada.")

H(3, "2.5.4 Tablas del modelo y diccionario de datos resumido")
P("El modelo tiene 25 tablas: 23 en el esquema `public` y 2 en el esquema `geo`. Las tablas sintéticas "
  "`geo.demo_*` no se cuentan, porque solo sirven para demostraciones. El diccionario completo, con el tipo, "
  "la nulidad, el valor por defecto y las restricciones de cada columna, se entrega en el archivo "
  "`DICCIONARIO_DATOS.md`.")
DIC = [
    ("Usuarios y seguridad", [
        ("users", 14, "Cuentas de usuario con datos personales mínimos; contraseña como hash Argon2id"),
        ("user_preferences", 7, "Preferencias del usuario (1:1 con users)"),
        ("roles", 3, "Catálogo de roles"),
        ("permissions", 2, "Catálogo de permisos"),
        ("role_permissions", 2, "Relación N:M entre roles y permisos"),
        ("refresh_tokens", 11, "Sesiones con tokens rotativos (solo el hash)"),
        ("user_tokens", 7, "Tokens de un solo uso para restablecer contraseña y verificar correo"),
        ("audit_logs", 7, "Bitácora de auditoría de operaciones administrativas")]),
    ("Movilidad", [
        ("trips", 20, "Viajes registrados; distancia, CO₂ y puntos calculados por el servidor"),
        ("transport_modes", 3, "Configuración por medio de transporte"),
        ("emission_factors", 4, "Factores de emisión vigentes por medio (g CO₂/km por pasajero)"),
        ("vehicle_types", 6, "Tipos de automóvil con su factor de emisión y fuente")]),
    ("Gamificación y comunicación", [
        ("achievements", 11, "Catálogo de logros"),
        ("user_achievements", 5, "Logros obtenidos por cada usuario (N:M)"),
        ("notifications", 8, "Notificaciones dentro de la aplicación")]),
    ("Infraestructura", [
        ("pois", 9, "Puntos de interés (supertipo de la especialización)"),
        ("transit_stops", 4, "Subtipo: paradas de autobús"),
        ("bike_stations", 4, "Subtipo: estaciones y estacionamientos de bicicleta"),
        ("transit_lines", 4, "Líneas de transporte público"),
        ("stop_lines", 2, "Relación N:M entre paradas y líneas"),
        ("cycleways", 6, "Ciclovías de OpenStreetMap")]),
    ("Participación y administración", [
        ("citizen_reports", 11, "Reportes ciudadanos sobre infraestructura y seguridad"),
        ("reports", 8, "Informes administrativos generados (CSV o PDF)")]),
    ("Territorio", [
        ("geo.mobility_zones", 10, "Zonas de análisis: municipios y AGEB del INEGI"),
        ("geo.zone_census", 7, "Población y vivienda del Censo 2020 por zona")]),
]
rows, n = [], 0
for grp, tabs in DIC:
    for name, cols, desc in tabs:
        n += 1
        rows.append([str(n), f"`{name}`", grp, str(cols), desc])
TABLE("Tablas del modelo y diccionario de datos resumido", ["#", "Tabla", "Grupo", "Columnas", "Descripción"],
      rows, "Elaboración propia a partir del catálogo de PostgreSQL.", widths=[0.9, 4.4, 3.4, 2.8, 6.0])

# ---------------------------------------------------------------- 2.6
H(2, "2.6 Ejemplos de consultas SQL")
P("El archivo `03_consultas.sql` contiene 24 consultas (Q1 a Q24) que demuestran distintas técnicas sobre "
  "los datos de ejemplo, y `04_consultas_espaciales.sql` contiene las consultas espaciales del análisis de "
  "datos (A1 a A6 sobre viajes y B1 a B8 sobre datos del INEGI y de OpenStreetMap). La Tabla 11 las agrupa "
  "por técnica.")
TABLE("Consultas de ejemplo agrupadas por técnica",
      ["Técnica", "Consultas"],
      [["Reunión (JOIN) de tres o más tablas y LEFT JOIN", "Q1, Q2, Q3"],
       ["Agregación con GROUP BY, HAVING y FILTER", "Q4, Q5, Q6"],
       ["Subconsultas correlacionadas, NOT EXISTS e IN", "Q7, Q8, Q9"],
       ["Expresiones de tabla comunes (CTE) y funciones de ventana", "Q10, Q11, Q12"],
       ["Consultas espaciales con PostGIS", "Q13 a Q16, A1 a A6, B1 a B8"],
       ["Vista, índices y plan de ejecución (EXPLAIN)", "Q17 a Q20"],
       ["Operaciones CRUD dentro de una transacción con ROLLBACK", "Q21 a Q24"]],
      "Elaboración propia.", align_num=False)
P("**Q2. Reunión de cuatro tablas con la especialización EER.** Obtiene las paradas de autobús con su código "
  "oficial y las líneas que pasan por ellas mediante la tabla N:M `stop_lines`.")
CODE("""SELECT p.name AS parada, ts.code AS codigo_oficial,
    string_agg(tl.code, ', ' ORDER BY tl.code) AS lineas
FROM pois p
JOIN transit_stops ts ON ts.poi_id = p.id AND ts.category = p.category
JOIN stop_lines sl ON sl.stop_id = ts.poi_id
JOIN transit_lines tl ON tl.id = sl.line_id
GROUP BY p.name, ts.code
ORDER BY ts.code NULLS LAST, p.name
LIMIT 10;""")
P("**Q4. Agregación con k-anonimato.** Calcula el CO₂ evitado por medio de transporte y, con HAVING, oculta "
  "los medios usados por menos de tres personas.")
CODE("""SELECT t.mode, count(*) AS viajes,
    count(DISTINCT t.user_id) AS usuarios,
    round(sum(t.distance_m)::numeric / 1000, 1) AS km,
    round(sum(t.co2_saved_g)::numeric / 1000, 2) AS kg_co2_evitado
FROM trips t
WHERE t.status = 'COMPLETED'
GROUP BY t.mode
HAVING count(DISTINCT t.user_id) >= 3
ORDER BY kg_co2_evitado DESC;""")
P("**Q8. Subconsulta con NOT EXISTS.** Lista los logros activos que ningún usuario ha obtenido.")
CODE("""SELECT a.code, a.name, a.criterion, a.threshold
FROM achievements a
WHERE a.is_active
    AND NOT EXISTS (SELECT 1 FROM user_achievements ua
                    WHERE ua.achievement_id = a.id);""")
P("**Q10. CTE y función de ventana RANK.** Construye el ranking de puntos (viajes y bonos) solo con las "
  "personas que aceptaron aparecer en él y muestra el nombre abreviado.")
CODE("""WITH puntos AS (
    SELECT user_id, sum(points) AS pts FROM trips
    WHERE status = 'COMPLETED' GROUP BY user_id
    UNION ALL
    SELECT user_id, sum(bonus_points) FROM user_achievements
    GROUP BY user_id
), total AS (
    SELECT user_id, sum(pts) AS puntos FROM puntos GROUP BY user_id
)
SELECT rank() OVER (ORDER BY t.puntos DESC) AS posicion,
    split_part(u.full_name, ' ', 1) || ' ' ||
    left(split_part(u.full_name, ' ', 2), 1) || '.' AS nombre,
    t.puntos
FROM total t JOIN users u ON u.id = t.user_id
WHERE u.ranking_opt_in AND u.is_active
ORDER BY posicion;""")
P("**Q13. Consulta espacial con ST_DWithin.** Encuentra las estaciones de bicicleta a 800 m o menos del "
  "Jardín Zenea y calcula la distancia exacta en metros sobre el elipsoide.")
CODE("""SELECT p.name, bs.capacity,
    round(ST_Distance(p.location::geography,
        ST_SetSRID(ST_MakePoint(-100.3925, 20.5925), 4326)::geography)) AS metros
FROM pois p
JOIN bike_stations bs ON bs.poi_id = p.id
WHERE ST_DWithin(p.location::geography,
    ST_SetSRID(ST_MakePoint(-100.3925, 20.5925), 4326)::geography, 800)
ORDER BY metros;""")
P("**Q21. Alta de un punto de interés y de su subtipo.** La clave foránea compuesta `(poi_id, category)` "
  "impide que un estacionamiento de bicicletas se registre también como parada de autobús.")
CODE("""INSERT INTO pois (id, name, category, description, attributes, location)
VALUES ('00000000-0000-4000-8000-000000000001', 'Ciclopuerto de ejemplo',
    'BIKE_PARKING', 'Creado por 03_consultas.sql', '{}'::jsonb,
    ST_SetSRID(ST_MakePoint(-100.3890, 20.5930), 4326));
INSERT INTO bike_stations (poi_id, category, code, capacity)
VALUES ('00000000-0000-4000-8000-000000000001', 'BIKE_PARKING', 'QB-900', 20);""")
P("**B1. Control de carga del censo.** Comprueba que la población de los 18 municipios coincida con el total "
  "estatal publicado por el INEGI (2 368 467 habitantes).")
CODE("""SELECT count(*) AS municipios, sum(c.pobtot) AS poblacion
FROM geo.mobility_zones z
JOIN geo.zone_census c
    ON c.zone_code = z.code AND c.source = 'INEGI-CPV-2020'
WHERE z.kind = 'municipio';""")

# ---------------------------------------------------------------- 2.7
H(2, "2.7 Prototipo funcional y evidencias del CRUD")
P("El prototipo consta de cuatro componentes. La base de datos PostgreSQL con PostGIS es la única fuente de "
  "verdad; una API desarrollada con FastAPI es el único componente que accede a ella y aplica las reglas de "
  "negocio, el cálculo de CO₂ y la autorización por rol; una aplicación web desarrollada con Next.js ofrece "
  "la parte pública, el área privada y el panel de administración, y una aplicación Android desarrollada con "
  "Expo registra los viajes con GPS. Los mapas usan cartografía de OpenStreetMap.")
P("Las evidencias se generaron de forma reproducible sobre una base de datos con datos ficticios (cuentas "
  "con dominio `@ejemplo.mx`). Las Figuras 4 a 9 muestran el CRUD de puntos de interés en el panel de "
  "administración, y las Figuras 10 a 15, el CRUD de viajes en el área privada del usuario. El alta de "
  "viajes se realiza desde la aplicación Android, que envía la traza completa al terminar el recorrido.")
EVID = [
    ("01-poi-crear-formulario.png", "Formulario de alta de un punto de infraestructura con la ubicación elegida sobre el mapa (crear)"),
    ("02-poi-crear-resultado.png", "Confirmación del alta: el estacionamiento de bicicletas se guarda en la tabla pois y aparece en el mapa (crear)"),
    ("03-poi-listar-mapa.png", "Puntos activos del área visible del mapa público, obtenidos mediante una consulta espacial (leer)"),
    ("04-poi-editar-formulario.png", "Edición del nombre y la capacidad del punto (actualizar)"),
    ("05-poi-eliminar-confirmacion.png", "Confirmación previa a la eliminación del punto (eliminar)"),
    ("06-poi-eliminar-resultado.png", "Resultado de la eliminación lógica: el punto deja de mostrarse y la operación queda en la bitácora (eliminar)"),
    ("07-viaje-listar.png", "Listado paginado de los viajes del usuario con distancia, duración y CO₂ evitado (leer)"),
    ("08-viaje-detalle.png", "Detalle de un viaje con su traza sobre el mapa y los indicadores calculados (leer)"),
    ("11-viaje-editar-formulario.png", "Edición del medio de transporte de un viaje, de bicicleta a autobús (actualizar)"),
    ("12-viaje-editar-resultado.png", "Resultado de la edición: el servidor recalcula el CO₂ evitado, el CO₂ emitido y los puntos (actualizar)"),
    ("09-viaje-eliminar-confirmacion.png", "Confirmación previa a la eliminación de un viaje propio (eliminar)"),
    ("10-viaje-eliminar-resultado.png", "Resultado de la eliminación física: el viaje desaparece de la tabla trips y del listado (eliminar)"),
]
for k, (f, cap) in enumerate(EVID):
    FIGURE(EV + f, cap, width_cm=14.2, note="Captura del prototipo web con datos ficticios. Mapa: © colaboradores de OpenStreetMap (ODbL).")
P("Cada operación se comprobó directamente en la base de datos con las consultas del archivo "
  "`verificacion.sql`. La Tabla 12 resume los resultados obtenidos.")
TABLE("Verificación de las operaciones CRUD en la base de datos",
      ["Operación", "Resultado en la base de datos"],
      [["Crear punto", "Nuevo registro en `pois` (categoría BIKE_PARKING) y en `bike_stations` con capacidad 20"],
       ["Actualizar punto", "Nombre «Ciclopuerto Ejemplo Alameda (ampliado)», capacidad 35 y `updated_at` actualizado"],
       ["Eliminar punto", "`is_active = false` (borrado lógico)"],
       ["Bitácora", "Tres registros en `audit_logs`: POI_CREATED, POI_UPDATED y POI_DELETED"],
       ["Crear viajes", "Tres viajes (bicicleta, autobús y caminata) con distancia y CO₂ calculados por el servidor"],
       ["Actualizar viaje", "De bicicleta a autobús: CO₂ evitado de 339.4 g a 206.7 g, CO₂ emitido de 0.0 g a 132.6 g y puntos de 3 a 2"],
       ["Eliminar viaje", "El viaje ya no existe en `trips`; quedan dos viajes del usuario"]],
      "Elaboración propia con la salida de `verificacion.sql`.", align_num=False)

# ---------------------------------------------------------------- 2.8
H(2, "2.8 Estadísticas")
P("La API ofrece estadísticas personales (CO₂ evitado, kilómetros, viajes y series por semana o por mes) y "
  "estadísticas agregadas para la administración, con k-anonimato. Las Figuras 16 a 18 presentan las "
  "estadísticas del análisis de datos obtenidas con las consultas espaciales del bloque B.")
FIGURE(f"{FIG}/g_cobertura.png", "Población urbana con acceso cercano a paradas de autobús y a ciclovías",
       width_cm=15, note="Elaboración propia con datos de INEGI (2021a, 2021b) y OpenStreetMap contributors (2026).")
FIGURE(f"{FIG}/g_ciclovia.png", "Kilómetros de ciclovía por cada 10 000 habitantes urbanos", width_cm=15,
       note="Elaboración propia con datos de INEGI (2021b) y OpenStreetMap contributors (2026).")
FIGURE(f"{FIG}/g_viviendas.png", "Viviendas particulares habitadas con automóvil, bicicleta y motocicleta",
       width_cm=15, note="Elaboración propia con datos de INEGI (2021b).")
TABLE("Ciclovías por municipio",
      ["Municipio", "Población urbana", "km de ciclovía", "km confinados", "km por 10 000 hab"],
      [["Querétaro", "996 222", "158.4", "79.8", "1.59"],
       ["Corregidora", "192 192", "23.5", "16.0", "1.22"],
       ["El Marqués", "177 073", "81.4", "33.1", "4.60"],
       ["Pedro Escobedo", "27 934", "0.0", "0.0", "0.00"],
       ["Colón", "6 114", "0.0", "0.0", "0.00"]],
      "Elaboración propia con datos de INEGI (2021b) y OpenStreetMap contributors (2026). Se omite Huimilpan, "
      "cuyo valor está inflado porque solo tres de sus AGEB entran al área de estudio.")
TABLE("AGEB densas más pobladas sin ciclovía a 500 m o menos",
      ["Clave geoestadística", "Municipio", "Población", "hab/km²", "m a la parada más cercana"],
      [["2201400011975", "Querétaro", "9 816", "15 146", "0"],
       ["2201400012795", "Querétaro", "8 144", "12 836", "0"],
       ["2201400014414", "Querétaro", "7 030", "13 992", "556"],
       ["2201400011689", "Querétaro", "6 470", "15 266", "0"],
       ["2201401053083", "Querétaro", "6 126", "12 558", "0"],
       ["2201400013647", "Querétaro", "6 082", "14 930", "0"],
       ["2201400011547", "Querétaro", "6 003", "21 256", "0"],
       ["2201400013810", "Querétaro", "5 355", "16 590", "0"],
       ["2200601420532", "Corregidora", "5 341", "16 403", "0"],
       ["2201400014132", "Querétaro", "5 309", "18 647", "254"]],
      "Elaboración propia con datos de INEGI (2021a, 2021b) y OpenStreetMap contributors (2026). Se muestran "
      "las 10 primeras de 15; 0 m indica que hay al menos una parada dentro de la AGEB.")
P("En cuanto a la demanda observada, EcoMove tiene registrados 3 viajes oficiales completados de 2 usuarios "
  "entre el 15 y el 16 de noviembre de 2026. Con esa muestra, el índice de prioridad marca todas las zonas "
  "como «datos insuficientes», ya que exige al menos 10 usuarios y 20 extremos de viaje por zona. Por ello, "
  "las AGEB de la Tabla 14 se consideran candidatas a estudio y no una necesidad demostrada.")

# ---------------------------------------------------------------- 2.9
H(2, "2.9 Viabilidad técnica, económica y social")
P("**Viabilidad técnica.** Todas las tecnologías empleadas (PostgreSQL, PostGIS, FastAPI, Next.js y Expo) son "
  "de código abierto, maduras y con amplia documentación. La base de datos está normalizada y documentada; "
  "los datos oficiales ya están cargados y pueden recargarse con los importadores del proyecto, y el CRUD "
  "está verificado. La API no guarda estado, por lo que puede escalarse horizontalmente. Los riesgos técnicos "
  "son la dependencia de los servidores públicos de mapas de OpenStreetMap, cuya política prohíbe el tráfico "
  "intensivo, y la cobertura incompleta de OpenStreetMap en algunos municipios.")
TABLE("Viabilidad económica",
      ["Concepto", "Costo", "Observación"],
      [["Licencias de software", "0", "Todo el software es de código abierto"],
       ["Datos", "0", "INEGI (libre uso) y OpenStreetMap (ODbL 1.0)"],
       ["Desarrollo", "[POR CONFIRMAR]", "Desarrollado como proyecto académico"],
       ["Servidor y base de datos en la nube", "[POR CONFIRMAR]", "Depende del proveedor y del número de usuarios"],
       ["Servicio propio de mapas", "[POR CONFIRMAR]", "Necesario antes de la operación pública"],
       ["Publicación en Google Play", "[POR CONFIRMAR]", "Cuota de registro de desarrollador"]],
      "Elaboración propia. Los costos marcados como [POR CONFIRMAR] no se han cotizado.", align_num=False)
P("**Viabilidad económica.** El costo de software y de datos es nulo. Como modelo de sostenibilidad se "
  "proponen convenios con gobiernos municipales o con el organismo estatal de transporte, que recibirían "
  "indicadores agregados y anónimos de demanda, y patrocinios de empresas con programas de movilidad "
  "sostenible para su personal. Ninguno de estos convenios existe todavía.")
P("**Viabilidad social.** Entre el 15.2 % y el 18.8 % de las viviendas de los tres municipios principales "
  "tienen bicicleta y el 58.2 % de la población urbana vive cerca de una parada, lo que representa una base "
  "amplia de usuarios potenciales. La aplicación es gratuita y voluntaria, solicita datos personales mínimos, "
  "permite exportar y eliminar la cuenta, y el ranking es opcional. Las barreras previstas son la brecha "
  "digital, la desconfianza ante el registro de la ubicación y la baja adopción inicial.")

# ---------------------------------------------------------------- 2.10
H(2, "2.10 Impacto en la industria y en los ODS")
P("En la industria, EcoMove aporta datos de demanda donde hoy no existen fuentes abiertas, y su modelo de "
  "datos y sus consultas espaciales (cobertura por población, kilómetros de ciclovía por habitante y AGEB "
  "densas sin ciclovía) pueden replicarse en otras ciudades con datos del INEGI y de OpenStreetMap. El "
  "cálculo de CO₂ con factores versionados y con fuente permite a empresas e instituciones medir el efecto de "
  "sus programas de movilidad. La Tabla 16 resume el impacto esperado en los ODS.")
TABLE("Impacto esperado en los ODS",
      ["ODS", "Impacto esperado", "Indicador en EcoMove"],
      [["9", "Priorizar la inversión en infraestructura con datos", "Viajes por zona con k ≥ 5; AGEB densas sin ciclovía"],
       ["11", "Mejor acceso a transporte sostenible", "Porcentaje de población a ≤ 400 m de parada y a ≤ 300 m de ciclovía"],
       ["12", "Decisiones de movilidad informadas", "CO₂ evitado por persona y por ciudad"],
       ["15", "Menor presión ambiental del transporte (indirecto)", "CO₂ evitado acumulado"]],
      "Elaboración propia.", align_num=False)

# ---------------------------------------------------------------- 2.11
H(2, "2.11 Historias de usuario")
P("Las historias de usuario se redactaron con el formato «Como [rol], quiero [acción] para [beneficio]» para "
  "los tres roles del sistema. Los permisos son jerárquicos: el administrador incluye los permisos del "
  "ciudadano, y el superadministrador, los del administrador.")
HU = [
    ("HU-01", "USER", "Como ciudadano, quiero crear una cuenta e iniciar sesión para guardar mis viajes de forma segura.",
     ["La contraseña se guarda solo como hash.", "La cuenta se bloquea tras varios intentos fallidos."]),
    ("HU-02", "USER", "Como ciudadano, quiero registrar un viaje con su medio y su ruta para conocer el CO₂ que evité.",
     ["El servidor calcula la distancia, el CO₂ y los puntos.", "Un viaje enviado dos veces no se duplica."]),
    ("HU-03", "USER", "Como ciudadano, quiero comparar el CO₂ de varios medios para elegir el más sostenible.",
     ["Puedo buscar origen y destino por nombre.", "Puedo indicar el tipo de auto y los ocupantes."]),
    ("HU-04", "USER", "Como ciudadano, quiero consultar, editar y borrar mis viajes para mantener mis datos al día.",
     ["Al editar, se recalculan el CO₂ y los puntos.", "Solo accedo a mis propios viajes."]),
    ("HU-05", "USER", "Como ciudadano, quiero ver paradas, ciclovías y estaciones cercanas para planear mi ruta.",
     ["El mapa muestra la atribución de OpenStreetMap.", "Se distinguen las ciclovías confinadas."]),
    ("HU-06", "USER", "Como ciudadano, quiero ver mi CO₂ evitado y mis logros para motivarme.",
     ["Hay vistas por semana y por mes.", "Aparezco en el ranking solo si lo acepto."]),
    ("HU-07", "USER", "Como ciudadano, quiero reportar un problema de infraestructura para que se atienda.",
     ["Máximo 10 reportes por día.", "Puedo consultar el estado de mis reportes."]),
    ("HU-08", "USER", "Como ciudadano, quiero exportar o eliminar mi cuenta para ejercer mis derechos sobre mis datos.",
     ["Eliminar la cuenta exige confirmar la contraseña."]),
    ("HU-09", "ADMIN", "Como administrador, quiero dar de alta, editar y desactivar puntos de infraestructura para mantener el mapa actualizado.",
     ["La eliminación es lógica y queda en la bitácora.", "Una parada no puede ser también estación de bicicleta."]),
    ("HU-10", "ADMIN", "Como administrador, quiero suspender cuentas que incumplan las reglas para proteger la plataforma.",
     ["Debo indicar un motivo.", "No puedo suspender a otro administrador."]),
    ("HU-11", "ADMIN", "Como administrador, quiero filtrar y cambiar el estado de los reportes ciudadanos para darles seguimiento.",
     ["Puedo añadir una nota de resolución."]),
    ("HU-12", "ADMIN", "Como administrador, quiero ver los viajes agregados por zona para priorizar ciclovías y paradas.",
     ["Se ocultan las zonas con menos de 5 usuarios."]),
    ("HU-13", "ADMIN", "Como administrador, quiero generar informes en CSV o PDF para compartir indicadores.",
     ["Los informes no contienen datos personales."]),
    ("HU-14", "SUPER_ADMIN", "Como superadministrador, quiero cambiar el rol de un usuario para delegar la administración.",
     ["Se revocan las sesiones del usuario.", "Siempre existe al menos un superadministrador activo."]),
    ("HU-15", "SUPER_ADMIN", "Como superadministrador, quiero actualizar los factores de emisión para usar valores vigentes.",
     ["Los viajes anteriores conservan su factor."]),
    ("HU-16", "SUPER_ADMIN", "Como superadministrador, quiero consultar la bitácora de auditoría para detectar abusos.",
     ["Puedo filtrar por actor y por acción."]),
]
TABLE("Historias de usuario y criterios de aceptación", ["ID", "Rol", "Historia", "Criterios de aceptación"],
      [[i, r, h, [f"• {c}" for c in cs]] for i, r, h, cs in HU],
      "Elaboración propia con base en el contrato de la API del proyecto.", widths=[1.7, 3.4, 6.4, 6.0],
      align_num=False)

# ---------------------------------------------------------------- 2.12
H(2, "2.12 Limitaciones")
TABLE("Limitaciones de los datos y del análisis",
      ["Limitación", "Efecto"],
      [["OpenStreetMap es colaborativo e incompleto y no se contrastó con inventarios oficiales",
        "La cobertura real puede ser mayor; los ceros de Pedro Escobedo y Colón son sospechosos"],
       ["Interpolación areal con población uniforme dentro de cada AGEB",
        "Sobrestima o subestima la cobertura en AGEB grandes o con zonas sin vivienda"],
       ["Distancia euclidiana, no por red peatonal", "Sobrestima el acceso cuando hay barreras físicas"],
       ["Umbrales de 400 m y 300 m elegidos como criterio de análisis", "Otros umbrales cambiarían las cifras"],
       ["Censo de 2020 frente a infraestructura de 2026", "La población de las zonas en expansión está subestimada"],
       ["Las paradas de OpenStreetMap no indican frecuencia ni ruta", "Una parada cercana no garantiza un servicio útil"],
       ["Factores de emisión por medio sin fuente oficial trazable", "Se presentan como supuestos del prototipo"],
       ["Factores de la EPA basados en el mercado de Estados Unidos", "La flota mexicana difiere en tamaño, antigüedad y mantenimiento"],
       ["Factor de los vehículos eléctricos pendiente de verificar", "El CO₂ de ese tipo es una estimación propia"],
       ["Sin encuesta origen-destino ni datos oficiales del transporte público", "No hay demanda observada fuera de la aplicación"],
       ["Solo 3 viajes oficiales registrados", "No es posible concluir sobre la demanda"]],
      "Elaboración propia.", align_num=False)

# ---------------------------------------------------------------- 3
H(1, "3. CONCLUSIONES")
P("El análisis de datos oficiales confirmó la necesidad que motiva el proyecto: en la zona metropolitana de "
  "Querétaro, el 58.2 % de la población urbana vive cerca de una parada de autobús, pero solo el 20.9 % vive "
  "cerca de una ciclovía, y 287 702 personas de las zonas más densas no tienen una ciclovía a 500 m o menos. "
  "A esto se suma una alta tenencia de automóvil y la ausencia de datos abiertos de viajes.")
P("EcoMove Querétaro responde a esa necesidad con una base de datos relacional y espacial de 25 tablas, "
  "normalizada hasta la tercera forma normal, con especializaciones disjuntas garantizadas por restricciones, "
  "integridad referencial explícita, índices espaciales y documentación completa. El prototipo funcional "
  "demuestra operaciones CRUD verificadas en la base de datos, y las consultas de ejemplo cubren reuniones, "
  "agregaciones, subconsultas, funciones de ventana, vistas, índices y análisis espacial.")
P("El proyecto es viable técnica y económicamente porque se basa en software y datos abiertos, y se alinea "
  "de forma directa con los ODS 9, 11 y 12, y de forma indirecta con el ODS 15. Su principal limitación es la "
  "escasa demanda registrada hasta ahora; por ello, el siguiente paso es aumentar la adopción de la "
  "aplicación, sustituir los factores de emisión por medio con una fuente oficial y contrastar los datos de "
  "OpenStreetMap con inventarios oficiales.")

# ---------------------------------------------------------------- referencias
H(1, "REFERENCIAS")
REFS = [
    "Chen, P. P.-S. (1976). The entity-relationship model: Toward a unified view of data. *ACM Transactions on Database Systems, 1*(1), 9–36. https://doi.org/10.1145/320434.320440",
    "Codd, E. F. (1970). A relational model of data for large shared data banks. *Communications of the ACM, 13*(6), 377–387. https://doi.org/10.1145/362384.362685",
    "Elmasri, R., y Navathe, S. B. (2016). *Fundamentals of database systems* (7.ª ed.). Pearson.",
    "Instituto Nacional de Estadística y Geografía. (2021a). *Marco Geoestadístico. Censo de Población y Vivienda 2020: Querétaro* [Conjunto de datos]. INEGI. https://www.inegi.org.mx/temas/mg/",
    "Instituto Nacional de Estadística y Geografía. (2021b). *Principales resultados por AGEB y manzana urbana del Censo de Población y Vivienda 2020: Querétaro* [Conjunto de datos]. INEGI. https://www.inegi.org.mx/programas/ccpv/2020/#Datos_abiertos",
    "Naciones Unidas. (2015). *Transformar nuestro mundo: la Agenda 2030 para el Desarrollo Sostenible* (A/RES/70/1). https://www.un.org/sustainabledevelopment/es/",
    "OpenStreetMap contributors. (2026). *OpenStreetMap* [Conjunto de datos; extracción del 16 de noviembre de 2026 vía Overpass API]. OpenStreetMap Foundation. https://www.openstreetmap.org",
    "U.S. Environmental Protection Agency. (2023). *Greenhouse gas emissions from a typical passenger vehicle* (EPA-420-F-23-014). https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle",
    "U.S. Environmental Protection Agency. (2026). *The 2025 EPA automotive trends report: Greenhouse gas emissions, fuel economy, and technology since 1975* (EPA-420-R-26-001). https://www.epa.gov/automotive-trends",
]
for ref in REFS:
    p = P(ref, align=WD_ALIGN_PARAGRAPH.LEFT)
    p.paragraph_format.left_indent = Cm(1.27); p.paragraph_format.first_line_indent = Cm(-1.27)

# ================================================================ índices
def toc_entry_par(anchor, text, page, indent_cm):
    p = OxmlElement("w:p"); anchor.addnext(p)
    from docx.text.paragraph import Paragraph
    par = Paragraph(p, anchor.getparent())
    par.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf = par.paragraph_format
    pf.left_indent = Cm(indent_cm); pf.space_after = Pt(3)
    pf.tab_stops.add_tab_stop(Cm(TEXT_W), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    runs(par, text); par.add_run("\t" + str(page))
    return par

def fill_index(key, entries, instr):
    anchor = INDEX_SLOTS[key]._p
    first = last = None
    for level, text in entries:
        page = PAGES.get(text, "0")
        par = toc_entry_par(anchor, text, page, 0.6 * (level - 1))
        anchor = par._p
        first = first or par; last = par
    # envolver las entradas en un campo de Word (TOC) para que pueda actualizarse
    b = OxmlElement("w:r"); fc = OxmlElement("w:fldChar"); fc.set(qn("w:fldCharType"), "begin"); b.append(fc)
    i = OxmlElement("w:r"); it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = f" {instr} "; i.append(it)
    s = OxmlElement("w:r"); fs = OxmlElement("w:fldChar"); fs.set(qn("w:fldCharType"), "separate"); s.append(fs)
    pPr = first._p.pPr
    pPr.addnext(s); pPr.addnext(i); pPr.addnext(b)
    e = OxmlElement("w:r"); fe = OxmlElement("w:fldChar"); fe.set(qn("w:fldCharType"), "end"); e.append(fe)
    last._p.append(e)

fill_index("toc", TOC, 'TOC \\o "1-3" \\h \\z \\u')
fill_index("tab", [(1, t) for t in TABS], 'TOC \\h \\z \\c "Tabla"')
fill_index("fig", [(1, f) for f in FIGS], 'TOC \\h \\z \\c "Figura"')

doc.core_properties.title = "EcoMove Querétaro: informe del proyecto final"
doc.core_properties.author = "[INTEGRANTES]"
doc.core_properties.language = "es-MX"
doc.save(OUT)
json.dump({"toc": TOC, "tab": TABS, "fig": FIGS}, open(OUT + ".entries.json", "w"), ensure_ascii=False)
print("ok", len(TOC), len(TABS), len(FIGS))
