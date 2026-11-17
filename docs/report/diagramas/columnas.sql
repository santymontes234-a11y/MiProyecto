select n.nspname, c.relname, coalesce(obj_description(c.oid,'pg_class'),''), a.attnum, a.attname,
  format_type(a.atttypid,a.atttypmod), case when a.attnotnull then 'NO' else 'SÍ' end,
  coalesce(pg_get_expr(d.adbin,d.adrelid),''),
  coalesce((select string_agg(case con.contype when 'p' then 'PK' when 'u' then 'UQ' when 'f' then 'FK → '||(select n2.nspname||'.'||c2.relname||'('||(select string_agg(attname, ',') from pg_attribute where attrelid=con.confrelid and attnum = any(con.confkey))||')' from pg_class c2 join pg_namespace n2 on n2.oid=c2.relnamespace where c2.oid=con.confrelid) end, ', ' order by con.contype desc)
     from pg_constraint con where con.conrelid=c.oid and a.attnum = any(con.conkey) and con.contype in ('p','u','f')),''),
  coalesce(col_description(c.oid,a.attnum),'')
from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where c.relkind='r' and ((n.nspname='public' and c.relname not in ('spatial_ref_sys')) or (n.nspname='geo' and c.relname in ('mobility_zones','zone_census')))
order by n.nspname desc, c.relname, a.attnum
