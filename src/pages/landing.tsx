import { Link } from "react-router";

export function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-6 py-10">
        <header className="flex items-center gap-3">
          <img
            src="/conclave.png"
            alt="Conclave"
            className="h-8 w-8 rounded-full object-cover"
          />
          <div className="text-xl font-bold tracking-tight">Conclave</div>
          <div className="ml-auto text-sm text-muted-foreground">v1.0.0-beta</div>
        </header>

        <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-5">
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
              A multi-agent decision engine that debates before it answers.
            </h1>
            <p className="text-base text-muted-foreground">
              Conclave runs structured deliberations between specialized agents,
              compares competing plans, and returns a final response backed by
              probabilities and evidence. For code prompts, it can trigger
              verification and attach real execution logs.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/app"
                className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
              >
                Start
              </Link>
              <span className="text-xs text-muted-foreground">
                View the debate simulator
              </span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md rounded-2xl border bg-card/60 p-3 shadow-sm">
            <video
              className="aspect-square w-full rounded-xl bg-black object-cover"
              src="/opening-conclave.mp4"
              controls
              playsInline
            />
          </div>
        </section>
      </div>
    </main>
  );
}
