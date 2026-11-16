"""Módulo de analítica geoespacial de EcoMove Querétaro.

- filters.py         filtros comunes, dataset official|demo, k-anonimato
- repository.py      llamadas parametrizadas a las funciones PostGIS (esquema geo)
- analytics.py       indicadores de ciudad (resumen, medios, horas pico, series)
- emissions.py       desglose de CO₂ a partir de valores guardados (no recalcula)
- priority_index.py  índice de prioridad de infraestructura, explicable y configurable

SQL: apps/api/db/geo/. Documentación: apps/api/docs/geo/.
"""
