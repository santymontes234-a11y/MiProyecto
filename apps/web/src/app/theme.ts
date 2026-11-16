import { toCssVariables } from "@ecomove/shared";

function block(selector: string, vars: Record<string, string>): string {
  return `${selector}{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}

/** CSS generado desde los tokens de shared: no hay colores sueltos en la web. */
export const themeCss = [
  block(":root", toCssVariables("light")),
  `@media (prefers-color-scheme: dark){${block(":root", toCssVariables("dark"))}:root{color-scheme:dark}}`,
].join("");
