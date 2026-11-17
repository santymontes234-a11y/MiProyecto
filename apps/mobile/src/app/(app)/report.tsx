import type { CitizenReportCategory, Position } from '@ecomove/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { EcoMap } from '@/components/map/EcoMap';
import type { MapMarker } from '@/components/map/map-protocol';
import { Banner } from '@/components/trips/TripComponents';
import { AppText, Button, Chip, Screen, TextField, useToast } from '@/components/ui';
import { CITIZEN_REPORT_LABELS } from '@/features/reports/labels';
import { api } from '@/lib/api';
import { fieldErrors, getErrorMessage } from '@/lib/errors';
import { formatCoord } from '@/lib/geo';
import { useTheme } from '@/theme/ThemeProvider';

const CATEGORIES = Object.keys(CITIZEN_REPORT_LABELS) as CitizenReportCategory[];

/** Reporte ciudadano (POST /citizen-reports): ubicación en el mapa, categoría y descripción. */
export default function ReportScreen() {
  const params = useLocalSearchParams<{ lng?: string; lat?: string; poi_id?: string; poi_name?: string }>();
  const { spacing, radius } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const initial: Position | null = params.lng && params.lat ? [Number(params.lng), Number(params.lat)] : null;
  const [location, setLocation] = useState<Position | null>(initial);
  const [category, setCategory] = useState<CitizenReportCategory | null>(params.poi_id ? 'POI_ISSUE' : null);
  const [title, setTitle] = useState(params.poi_name ? `Problema en ${params.poi_name}` : '');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const markers = useMemo<MapMarker[]>(() => (location ? [{ id: 'r', coord: location, kind: 'destination', label: 'Ubicación del reporte' }] : []), [location]);
  const fitTo = useMemo(() => (initial ? [initial] : null), [initial?.[0], initial?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    mutationFn: () =>
      api.citizenReports.create({
        category: category as CitizenReportCategory,
        title: title.trim(),
        description: description.trim(),
        location: { type: 'Point', coordinates: location as Position },
        poi_id: params.poi_id ?? null,
      }),
    onSuccess: () => {
      toast.success('¡Gracias! Tu reporte fue enviado.');
      void qc.invalidateQueries({ queryKey: ['citizen-reports'] });
      router.back();
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!location) errs.location = 'Toca el mapa para marcar dónde está el problema.';
    if (!category) errs.category = 'Elige una categoría.';
    if (title.trim().length < 3) errs.title = 'Escribe un título de al menos 3 caracteres.';
    if (title.trim().length > 120) errs.title = 'Máximo 120 caracteres.';
    if (description.trim().length > 2000) errs.description = 'Máximo 2000 caracteres.';
    setErrors(errs);
    if (!Object.keys(errs).length) send.mutate();
  };

  const generalError = send.isError && !Object.keys(fieldErrors(send.error)).length ? getErrorMessage(send.error) : null;

  return (
    <Screen keyboard footer={<Button label="Enviar reporte" icon="send" onPress={submit} loading={send.isPending} />}>
      <View style={{ height: 220, borderRadius: radius.lg, overflow: 'hidden' }}>
        <EcoMap tripMarkers={markers} fitTo={fitTo} onTap={setLocation} accessibilityLabel="Toca el mapa para marcar la ubicación del problema" />
      </View>
      <AppText variant="caption" tone={errors.location ? 'danger' : 'muted'} style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        {errors.location ?? (location ? `Ubicación: ${formatCoord(location)} · toca el mapa para cambiarla` : 'Toca el mapa para marcar la ubicación.')}
      </AppText>
      {generalError ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" message={generalError} />
        </View>
      ) : null}
      <AppText variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
        Categoría
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs }} accessibilityRole="radiogroup">
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CITIZEN_REPORT_LABELS[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <AppText variant="caption" tone="danger" style={{ marginBottom: spacing.lg }}>
        {errors.category ?? ''}
      </AppText>
      <TextField label="Título" value={title} onChangeText={setTitle} error={errors.title} maxLength={120} placeholder="Ej. Bache en la ciclovía" />
      <TextField
        label="Descripción (opcional)"
        value={description}
        onChangeText={setDescription}
        error={errors.description}
        multiline
        numberOfLines={4}
        maxLength={2000}
        textAlignVertical="top"
        placeholder="Describe el problema y cómo encontrarlo"
      />
    </Screen>
  );
}
