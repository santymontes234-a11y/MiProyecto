"use client";

import { Award, Lock, Star } from "lucide-react";
import { formatCo2, formatDistance, type UserAchievement } from "@ecomove/shared";
import { api } from "@/lib/api";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { ACHIEVEMENT_CRITERION_LABELS } from "@/lib/labels";
import { errorMessage, useApiQuery } from "@/hooks/useApiQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/StateViews";
import { Badge } from "@/components/ui/Badge";

function formatThreshold(a: UserAchievement["achievement"], v: number) {
  if (a.criterion === "DISTANCE_M") return formatDistance(v);
  if (a.criterion === "CO2_SAVED_G") return formatCo2(v);
  return formatNumber(v);
}

export default function AchievementsPage() {
  const list = useApiQuery("my-achievements", () => api.users.achievements());
  const profile = useApiQuery("gamification-me", () => api.gamification.me());
  const p = profile.data;
  const span = p && p.next_level_points !== null ? p.next_level_points - p.level_points : null;
  const levelProgress = p && span ? (p.points_total - p.level_points) / span : null;
  const unlocked = list.data?.filter((u) => u.awarded_at).length ?? 0;

  return (
    <>
      <PageHeader title="Logros" description="Puntos y logros que otorga EcoMove por tus viajes sostenibles." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Puntos" value={p ? formatNumber(p.points_total) : "—"} icon={<Star className="size-5" />} />
        <StatTile
          label="Nivel"
          value={p ? formatNumber(p.level) : "—"}
          hint={p ? (p.next_level_points === null ? "Nivel máximo alcanzado" : `${formatNumber(p.next_level_points - p.points_total)} puntos para el siguiente`) : undefined}
          icon={<Award className="size-5" />}
          accent="blue"
        />
        <StatTile label="Logros desbloqueados" value={list.data ? `${unlocked} / ${list.data.length}` : "—"} icon={<Award className="size-5" />} accent="yellow" />
      </div>
      {levelProgress !== null && (
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-xs text-ink-muted"><span>Progreso del nivel</span><span>{formatPercent(levelProgress)}</span></div>
          <div className="h-2 rounded-full bg-subtle" role="progressbar" aria-label="Progreso del nivel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelProgress * 100)}>
            <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, levelProgress * 100)}%` }} />
          </div>
        </div>
      )}
      {list.loading ? (
        <LoadingBlock />
      ) : list.error ? (
        <ErrorState message={errorMessage(list.error)} onRetry={list.refetch} />
      ) : !list.data?.length ? (
        <EmptyState title="Aún no hay logros configurados" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((u) => {
            const a = u.achievement;
            const ratio = a.threshold > 0 ? Math.min(1, u.progress / a.threshold) : 0;
            return (
              <li key={a.id}>
                <Card as="article" className={u.awarded_at ? "" : "opacity-80"}>
                  <div className="flex items-start gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-full ${u.awarded_at ? "bg-brand-soft text-brand-strong" : "bg-subtle text-ink-muted"}`} aria-hidden="true">
                      {u.awarded_at ? <Award className="size-5" /> : <Lock className="size-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold">{a.name}</h2>
                      <p className="text-sm text-ink-muted">{a.description}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-ink-muted">
                      <span>{ACHIEVEMENT_CRITERION_LABELS[a.criterion]}</span>
                      <span>{formatThreshold(a, u.progress)} / {formatThreshold(a, a.threshold)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-subtle" role="progressbar" aria-label={`Progreso de ${a.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
                      <div className="h-2 rounded-full bg-brand" style={{ width: `${ratio * 100}%` }} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {u.awarded_at ? <Badge tone="green">Desbloqueado el {formatDate(u.awarded_at)}</Badge> : <Badge>Bloqueado</Badge>}
                    {a.bonus_points > 0 && <Badge tone="yellow">+{formatNumber(a.bonus_points)} pts</Badge>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
