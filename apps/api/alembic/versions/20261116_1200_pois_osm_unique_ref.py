"""pois osm unique ref

Índice único parcial para los POIs importados de OpenStreetMap: la referencia (osm_type, osm_id)
vive en `attributes` y solo se exige unicidad cuando attributes->>'source' = 'osm'.
Lo usa el importador del módulo geo (app.services.geo_analytics.osm_import) para el upsert.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-16 12:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Falla de forma explícita si ya hubiera duplicados, en vez de crear un índice a medias.
    dupes = op.get_bind().execute(sa.text(
        "SELECT count(*) FROM (SELECT 1 FROM pois WHERE attributes->>'source' = 'osm' "
        "GROUP BY attributes->>'osm_type', attributes->>'osm_id' HAVING count(*) > 1) d"
    )).scalar_one()
    if dupes:
        raise RuntimeError(f"Hay {dupes} referencias OSM duplicadas en pois; depúralas antes de migrar")
    op.create_index(
        "ux_pois_osm_ref",
        "pois",
        [sa.text("(attributes->>'osm_type')"), sa.text("(attributes->>'osm_id')")],
        unique=True,
        postgresql_where=sa.text("attributes->>'source' = 'osm'"),
    )


def downgrade() -> None:
    op.drop_index("ux_pois_osm_ref", table_name="pois", postgresql_where=sa.text("attributes->>'source' = 'osm'"))
