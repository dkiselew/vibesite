import { FormEvent, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const search = window.location.search;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not sign in.");
      return;
    }
    const url = result.data && "url" in result.data ? result.data.url : undefined;
    window.location.assign(typeof url === "string" && url ? url : search ? `/consent${search}` : "/");
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Open your folder.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
            <a className="text-sm text-muted-foreground underline" href={`/sign-up${search}`}>
              Create an account
            </a>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

export function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const search = window.location.search;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await authClient.signUp.email({ name, email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not create the account.");
      return;
    }
    const url = result.data && "url" in result.data ? result.data.url : undefined;
    window.location.assign(typeof url === "string" && url ? url : search ? `/consent${search}` : "/");
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Your folder address comes from the email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <Input
              name="name"
              autoComplete="name"
              required
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </Button>
            <a className="text-sm text-muted-foreground underline" href={`/sign-in${search}`}>
              Already have an account
            </a>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function waitingForConsent(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has("sig") && params.has("client_id");
}

export function ConsentPage() {
  const waiting = waitingForConsent(window.location.search);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function allow() {
    setPending(true);
    setError("");
    const result = await authClient.$fetch("/oauth2/consent", {
      method: "POST",
      body: { accept: true },
    });
    const redirect =
      result.data && typeof result.data === "object" && "redirect_uri" in result.data
        ? result.data.redirect_uri
        : undefined;
    if (typeof redirect === "string" && redirect) {
      window.location.assign(redirect);
      return;
    }
    setPending(false);
    setError(result.error?.message || "Could not finish connecting.");
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Cursor</CardTitle>
          <CardDescription>
            The token keeps the folder that is active now. Switching folders later does not move it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="button" onClick={() => void allow()} disabled={pending || !waiting}>
            {pending ? "Connecting…" : "Allow"}
          </Button>
          {!waiting ? <p className="text-sm text-muted-foreground">Nothing is waiting for approval.</p> : null}
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center px-6 py-12">{children}</main>;
}
