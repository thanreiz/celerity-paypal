/**
 * Vite middleware that mounts the same /api handlers used on Vercel,
 * so `npm run dev` keeps signing secrets off the browser bundle.
 */
import addresses from "../addresses.js";
import invoke from "../invoke.js";
import oracleSign from "../oracle-sign.js";

function toNodeReq(req) {
  return req;
}

function toNodeRes(res) {
  const api = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      res.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      res.setHeader(k, v);
      return this;
    },
    json(body) {
      if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json");
      res.statusCode = this.statusCode || res.statusCode || 200;
      res.end(JSON.stringify(body));
    },
    end(body) {
      res.statusCode = this.statusCode || res.statusCode || 200;
      res.end(body);
    },
  };
  return api;
}

async function dispatch(handler, req, res) {
  const nodeRes = toNodeRes(res);
  try {
    await handler(toNodeReq(req), nodeRes);
  } catch (e) {
    if (!res.headersSent) {
      nodeRes.status(500).json({ error: e.message || String(e) });
    }
  }
}

export function apiDevPlugin() {
  return {
    name: "celerity-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url === "/api/addresses") return dispatch(addresses, req, res);
        if (url === "/api/invoke") return dispatch(invoke, req, res);
        if (url === "/api/oracle-sign") return dispatch(oracleSign, req, res);
        return next();
      });
    },
  };
}
