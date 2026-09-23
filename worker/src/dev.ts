import app from "./index";
import { handlePublic } from "./public";

// Local only. Production documents are served by the R2 custom domain, not this Worker.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const host = new URL(request.url).host;
    if (host === `${env.WORKSPACE_SLUG}.${env.HOST}`) {
      return handlePublic(request, env);
    }
    return app.fetch(request, env, ctx);
  },
};
