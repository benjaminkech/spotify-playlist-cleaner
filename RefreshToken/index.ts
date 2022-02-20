import { AzureFunction, Context } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { DateTime, Duration } from "luxon";
import SpotifyWebApi from "spotify-web-api-node";

const activityFunction: AzureFunction = async function (
  context: Context
): Promise<void> {
  const credential = new DefaultAzureCredential();
  const vaultName = process.env.AZURE_KEY_VAULT_NAME;
  const url = `https://${vaultName}.vault.azure.net/`;
  const client = new SecretClient(url, credential);

  const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.CALLBACK_URL,
  });
  const state = context.bindings.state;
  const accessToken = (await client.getSecret(`${state}-AccessToken`))
    .properties;
  const cleanupInterval = Duration.fromMillis(
    parseInt(process.env.CLEANUP_INTERVAL) * 6000
  );
  const expiresOn = DateTime.fromJSDate(accessToken.expiresOn, { zone: "utc" });
  const diff = expiresOn.diffNow("milliseconds");
  const slack = Duration.fromMillis(300000);

  const secretRefreshToken = `${state}-RefreshToken`;
  const secretAccessToken = `${state}-AccessToken`;

  spotifyApi.setRefreshToken(
    (await client.getSecret(secretRefreshToken)).value
  );

  if (diff.minus(cleanupInterval) < slack) {
    spotifyApi.refreshAccessToken().then(
      async function (data) {
        const date = DateTime.now().plus({ hours: 1 }).toJSDate();
        await client.setSecret(secretAccessToken, data.body["access_token"], {
          expiresOn: date,
        });
        console.log("The access token has been refreshed!");
      },
      function (err) {
        console.log(`Could not refresh access token ${err}`);
      }
    );
  } else {
    console.log("Token still valid");
  }
};

export default activityFunction;
