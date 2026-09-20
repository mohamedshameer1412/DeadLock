import AuthForm from "@/components/nexus/auth-form";

export const metadata = { title: "Create your account" };
export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
