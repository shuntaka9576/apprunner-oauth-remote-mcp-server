import type {
  AuthRequest,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { cors } from "hono/cors";
import config from "../config.js";
import {
  clientIdAlreadyApproved,
  parseRedirectApproval,
  renderApprovalDialog,
} from "../oauth-utils.js";
import { getUpstreamAuthorizeUrl } from "../utils.js";

type Props = {
  login: string;
  name?: string;
  email?: string;
  accessToken: string;
};

const cognitoDomain = config.userPoolDomain;

const AUTHORIZE_ENDPOINT = `${cognitoDomain}/login`;
const TOKEN_ENDPOINT = `${cognitoDomain}/oauth2/token`;
const USERINFO_ENDPOINT = `${cognitoDomain}/oauth2/userInfo`;

const app = new Hono<{ Bindings: {} & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.use("*", cors());
app.get("/health", (c) => c.body(null, 204));
app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) return c.text("Invalid request", 400);

  if (
    await clientIdAlreadyApproved(
      c.req.raw,
      clientId,
      config.cookieEncryptionKey,
    )
  ) {
    return redirectToCognito(c.req.raw, oauthReqInfo);
  }

  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    server: {
      name: "Sample MCP Server",
      logo: "https://devio2024-media.developers.io/image/upload/v1743988683/author-thumbnail/m3ahuz8efwmgnaklrzng.png",
      description:
        "Demo MCP Remote Server using Amazon Cognito User Pool for authentication.",
    },
    state: { oauthReqInfo },
  });
});

app.post("/authorize", async (c) => {
  const { state, headers } = await parseRedirectApproval(
    c.req.raw,
    config.cookieEncryptionKey,
  );
  if (!state.oauthReqInfo) return c.text("Invalid request", 400);

  return redirectToCognito(c.req.raw, state.oauthReqInfo, headers);
});

app.get("/callback", async (c) => {
  const oauthReqInfo = JSON.parse(
    atob(c.req.query("state") as string),
  ) as AuthRequest;

  if (!oauthReqInfo.clientId) return c.text("Invalid state", 400);

  const code = c.req.query("code");
  if (!code) return c.text("Missing code", 400);

  const tokenResp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.userPoolClientId,
      client_secret: config.userPoolClientSecret,
      code,
      redirect_uri: `${config.mcpServer}/callback`,
    }).toString(),
  });

  if (!tokenResp.ok) {
    console.error(await tokenResp.text());
    return c.text("Failed to fetch token", 500);
  }

  const tokenJson = (await tokenResp.json()) as {
    access_token: string;
    id_token?: string;
  };
  const accessToken = tokenJson.access_token;
  if (!accessToken) return c.text("Missing access token", 400);

  const userInfoResp = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userInfoResp.ok) {
    console.error(await userInfoResp.text());
    return c.text("Failed to fetch user info", 500);
  }

  const userInfo = (await userInfoResp.json()) as {
    sub: string;
    username?: string;
    preferred_username?: string;
    name?: string;
    email?: string;
  };

  const login =
    userInfo.username ?? userInfo.preferred_username ?? userInfo.sub;

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: login,
    metadata: { label: userInfo.name ?? login },
    scope: oauthReqInfo.scope,
    props: {
      login,
      name: userInfo.name,
      email: userInfo.email,
      accessToken,
    } as Props,
  });

  return Response.redirect(redirectTo, 302);
});

function redirectToCognito(
  _req: Request,
  oauthReqInfo: AuthRequest,
  headers: Record<string, string> = {},
) {
  const authorizeUrl = getUpstreamAuthorizeUrl({
    upstream_url: AUTHORIZE_ENDPOINT,
    scope: "openid profile email",
    client_id: config.userPoolClientId,
    redirect_uri: `${config.mcpServer}/callback`,
    state: btoa(JSON.stringify(oauthReqInfo)),
  });

  return new Response(null, {
    status: 302,
    headers: { ...headers, location: authorizeUrl },
  });
}

export { app as CognitoHandler };
