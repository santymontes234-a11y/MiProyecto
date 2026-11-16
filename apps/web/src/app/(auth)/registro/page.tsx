import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Regístrate en EcoMove Querétaro y empieza a medir el CO₂ que evitas.",
  alternates: { canonical: "/registro" },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
