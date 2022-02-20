import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import SpotifyWebApi from "spotify-web-api-node";

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log("HTTP trigger function processed a request.");

  const credential = new DefaultAzureCredential();
  const vaultName = process.env.AZURE_KEY_VAULT_NAME;
  const url = `https://${vaultName}.vault.azure.net/`;
  const client = new SecretClient(url, credential);

  const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.CALLBACK_URL,
  });

  const { code, state } = req.query;

  const data = await spotifyApi.authorizationCodeGrant(code);
  console.log("The token expires in " + data.body["expires_in"]);
  console.log("The access token is " + data.body["access_token"]);
  console.log("The refresh token is " + data.body["refresh_token"]);

  const { access_token: accessToken, refresh_token: refreshToken } = data.body;

  const date = new Date();
  date.setHours(date.getHours() + 1);
  await client.setSecret(`${state}-AccessToken`, accessToken, {
    expiresOn: date,
  });
  await client.setSecret(`${state}-RefreshToken`, refreshToken);

  spotifyApi.setAccessToken(accessToken);
  spotifyApi.setRefreshToken(refreshToken);

  context.res.status(302).set("location", process.env.REDIRECT_URL).send();
};

export default httpTrigger;
