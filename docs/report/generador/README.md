# Generador del informe (E1) y la presentación (E4)

Requiere `python-docx`, `python-pptx`, `matplotlib` y `cairosvg` (en un entorno virtual), además de
LibreOffice (`soffice`) y poppler (`pdftotext`, `pdfinfo`). Desde la raíz del repositorio:

```bash
python3 -m venv /tmp/venv-informe && /tmp/venv-informe/bin/pip install python-docx python-pptx matplotlib cairosvg
docs/report/generador/build.sh /tmp/venv-informe/bin/python /tmp/informe-build
/tmp/venv-informe/bin/python docs/report/generador/presentacion.py /tmp/informe-build/fig docs/report/Presentacion_EcoMove.pptx
```

`build.sh` hace dos pasadas: genera el DOCX, lo convierte a PDF, localiza en el PDF la página de
cada título, tabla y figura (`paginas.py`) y vuelve a generar el DOCX con esos números en los índices.

**Arial en el PDF:** esta máquina no tiene Arial y LibreOffice la sustituye por Liberation Sans (métricamente
idéntica). Para que el PDF incruste Arial, abrir `Informe_EcoMove.docx` en Word, llenar la portada,
actualizar los índices (clic derecho → Actualizar campos) y exportar a PDF.
