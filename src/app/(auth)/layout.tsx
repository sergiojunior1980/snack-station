import { cookies } from "next/headers";
import { LoginBrandProvider } from "@/components/auth-shell";
import { defaultLoginBrand } from "@/lib/brand";
import { loginBrand } from "@/server/queries";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const shop = cookieStore.get("snack-shop")?.value ?? "fiskparaiso";
  const brand = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shop) ? await loginBrand(shop) : defaultLoginBrand;
  return <LoginBrandProvider value={brand}>{children}</LoginBrandProvider>;
}
