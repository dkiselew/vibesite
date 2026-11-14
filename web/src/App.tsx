import { ConsentPage, SignInPage, SignUpPage } from "@/components/auth-pages";
import { DocsPage } from "@/components/docs-page";
import { DocumentList } from "@/components/document-list";
import { Toaster } from "@/components/ui/sonner";

export function App() {
  const path = window.location.pathname;
  const page =
    path === "/sign-in" ? (
      <SignInPage />
    ) : path === "/sign-up" ? (
      <SignUpPage />
    ) : path === "/consent" ? (
      <ConsentPage />
    ) : path === "/docs" ? (
      <DocsPage />
    ) : (
      <DocumentList />
    );
  return (
    <>
      {page}
      <Toaster />
    </>
  );
}
