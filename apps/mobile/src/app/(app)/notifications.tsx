import { Screen, ComingSoonState, EmptyState } from '@/components/ui';

/**
 * Pantalla 19 — Notificaciones.
 * La bandeja depende de GET /notifications (propuesta 2026-11-15-mobile-password-reset-notifications).
 * No se muestran notificaciones simuladas.
 */
export default function NotificationsScreen() {
  return (
    <Screen>
      <EmptyState icon="notifications-off-outline" title="No tienes notificaciones" message="Aquí verás avisos sobre tus logros, resúmenes semanales y novedades de EcoMove." />
      <ComingSoonState
        title="Notificaciones en preparación"
        message="Muy pronto recibirás avisos cuando desbloquees logros y un resumen semanal de tu impacto."
      />
    </Screen>
  );
}
