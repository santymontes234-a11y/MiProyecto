import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatTile } from "@/components/ui/StatTile";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { ModeBadge } from "@/components/ui/ModeBadge";
import { sanitizeCell } from "@/lib/export";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

describe("componentes UI", () => {
  it("StatTile muestra etiqueta, valor y unidad", () => {
    render(<StatTile label="CO₂ evitado" value="1.2" unit="kg" />);
    expect(screen.getByText("CO₂ evitado")).toBeInTheDocument();
    expect(screen.getByText("kg")).toBeInTheDocument();
  });

  it("DataTable: estados vacío, error y datos", async () => {
    const cols = [{ key: "n", header: "Nombre", cell: (r: { n: string }) => r.n }];
    const { rerender } = render(<DataTable caption="t" columns={cols} rows={[]} rowKey={(r) => r.n} emptyTitle="Nada por aquí" />);
    expect(screen.getByText("Nada por aquí")).toBeInTheDocument();

    const retry = vi.fn();
    rerender(<DataTable caption="t" columns={cols} rows={null} rowKey={(r) => r.n} error="Falló" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Falló");
    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(retry).toHaveBeenCalled();

    rerender(<DataTable caption="Tabla" columns={cols} rows={[{ n: "Ana" }]} rowKey={(r) => r.n} />);
    expect(screen.getByRole("table", { name: "Tabla" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nombre" })).toBeInTheDocument();
  });

  it("Button en carga queda deshabilitado y anuncia aria-busy", () => {
    render(<Button loading>Guardar</Button>);
    const b = screen.getByRole("button", { name: /guardar/i });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
  });

  it("ModeBadge usa texto, no solo color", () => {
    render(<ModeBadge mode="BICYCLE" />);
    expect(screen.getByText("Bicicleta")).toBeInTheDocument();
  });

  it("sanitizeCell es puro", () => {
    expect(sanitizeCell("ok")).toBe("ok");
  });
});
