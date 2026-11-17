"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import type { RankingEntry, RankingPeriod } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { errorMessage, useApiQuery, useMutation } from "@/hooks/useApiQuery";
import { useSession } from "@/components/auth/SessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Alert } from "@/components/ui/StateViews";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const columns: Column<RankingEntry>[] = [
  { key: "pos", header: "#", cell: (e) => <span className="font-semibold tabular-nums">{e.position}</span> },
  { key: "name", header: "Participante", cell: (e) => <span className={e.is_me ? "font-semibold text-brand-strong" : ""}>{e.display_name}{e.is_me && <Badge tone="green" className="ml-2">Tú</Badge>}</span> },
  { key: "pts", header: "Puntos", align: "right", cell: (e) => formatNumber(e.points) },
];

export default function RankingPage() {
  const { user, updateUser } = useSession();
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const ranking = useApiQuery(`ranking|${period}|${user.ranking_opt_in}`, () => api.gamification.ranking(period));
  const toggle = useMutation((v: boolean) => api.users.updateMe({ ranking_opt_in: v }));

  async function setOptIn(v: boolean) {
    const r = await toggle.run(v);
    if (r.ok) updateUser(r.data);
  }

  const r = ranking.data;
  return (
    <>
      <PageHeader title="Ranking" description="Top 50 de Querétaro por puntos. Solo aparece tu nombre corto (p. ej. «Ana L.»), nunca tu correo." />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">{user.ranking_opt_in ? "Participas en el ranking" : "No participas en el ranking"}</h2>
            <p className="text-sm text-ink-muted">Tu participación es voluntaria y puedes cambiarla cuando quieras.</p>
          </div>
          <Button variant={user.ranking_opt_in ? "secondary" : "primary"} loading={toggle.pending} onClick={() => setOptIn(!user.ranking_opt_in)}>
            {user.ranking_opt_in ? "Dejar de participar" : "Participar"}
          </Button>
        </div>
        {toggle.error && <div className="mt-3"><Alert tone="error">{toggle.error}</Alert></div>}
      </Card>
      <Card>
        <CardHeader
          title="Clasificación"
          description={r?.period_start ? `Desde el ${formatDate(r.period_start)}` : undefined}
          actions={<Segmented label="Periodo" value={period} onChange={setPeriod} options={[{ value: "week", label: "Semana" }, { value: "month", label: "Mes" }, { value: "all", label: "Histórico" }]} />}
        />
        {r?.me && (
          <p className="mb-4 flex items-center gap-2 rounded-md bg-brand-soft px-3 py-2 text-sm text-brand-strong">
            <Trophy className="size-4" aria-hidden="true" /> Tu posición: <strong>#{r.me.position}</strong> con {formatNumber(r.me.points)} puntos
          </p>
        )}
        <DataTable caption="Ranking de participantes" columns={columns} rows={r?.entries} rowKey={(e) => `${e.position}-${e.display_name}`} loading={ranking.loading} error={ranking.error ? errorMessage(ranking.error) : null} onRetry={ranking.refetch} emptyTitle="Todavía no hay participantes en este periodo" />
      </Card>
    </>
  );
}
