import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));
const login = vi.fn();
vi.mock("@/lib/session", () => ({ login: (...a: unknown[]) => login(...a) }));

import { LoginForm } from "@/components/auth/LoginForm";
import { ApiError } from "@ecomove/shared";

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockReset();
    login.mockReset();
  });

  it("valida formato antes de llamar a la API", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(await screen.findByText("Ingresa tu correo")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("muestra error genérico ante credenciales inválidas", async () => {
    login.mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "Credenciales inválidas"));
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@example.com");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "bicicleta1");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirige según el rol devuelto por la API y sanea ?next", async () => {
    login.mockResolvedValue({ id: "1", email: "a@b.mx", full_name: "A", role: "ADMIN", is_active: true, created_at: "" });
    render(<LoginForm next="https://evil.example" />);
    await userEvent.type(screen.getByLabelText(/correo/i), "a@b.mx");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "x");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
  });
});
