import type { CitizenReportStatus } from "@ecomove/shared";
import { CITIZEN_REPORT_STATUS_LABELS } from "@/lib/labels";
import { Badge, type Tone } from "@/components/ui/Badge";

const TONES: Record<CitizenReportStatus, Tone> = { OPEN: "yellow", IN_REVIEW: "blue", RESOLVED: "green", REJECTED: "gray" };

export function ReportStatusBadge({ status }: { status: CitizenReportStatus }) {
  return <Badge tone={TONES[status]}>{CITIZEN_REPORT_STATUS_LABELS[status]}</Badge>;
}
