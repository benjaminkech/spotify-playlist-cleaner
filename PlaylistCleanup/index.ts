import { AzureFunction, Context } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { SPCRequest } from "../Orchestrator";
import SpotifyWebApi from "spotify-web-api-node";
import * as df from "durable-functions";

interface Response<T> {
  body: T;
  headers: Record<string, string>;
  statusCode: number;
}

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.CALLBACK_URL,
});

const activityFunction: AzureFunction = async function (
  context: Context
): Promise<string> {
  const input = context.bindings.req as SPCRequest;

  const credential = new DefaultAzureCredential();
  const vaultName = process.env.AZURE_KEY_VAULT_NAME;
  const url = `https://${vaultName}.vault.azure.net/`;
  const client = new SecretClient(url, credential);

  const playlistId = input.playlistId;
  const contributors = input.contributors;
  const state = input.state;

  if (playlistId && state) {
    const secretAccessToken = `${state}-AccessToken`;
    const secretRefreshToken = `${state}-RefreshToken`;

    spotifyApi.setAccessToken(
      (await client.getSecret(secretAccessToken)).value
    );
    spotifyApi.setRefreshToken(
      (await client.getSecret(secretRefreshToken)).value
    );

    const items = await getAllItems(playlistId);
    const tracksToBeRemoved = [];

    for (const item of items) {
      if (contributors.find((user) => user !== item.added_by.id)) {
        tracksToBeRemoved.push({ uri: item.track.uri });
      }
    }

    await spotifyApi.removeTracksFromPlaylist(playlistId, tracksToBeRemoved);

    const doClient = df.getClient(context);
    const entityId = new df.EntityId("Counter", input.state);
    const stateResponse = await doClient.readEntityState(entityId);
    await doClient.signalEntity(entityId, "add", tracksToBeRemoved.length);

    return `Removed songs: ${
      stateResponse.entityExists
        ? (stateResponse.entityState as number) + tracksToBeRemoved.length
        : 0
    }`;
  } else {
    return "Invalid input";
  }
};

/**
 * Get all tracks in a playlist.
 * @param playlistId The playlist's ID.
 * @return A promise that if successful, resolves to an object that containing
 * all the tracks in the playlist. If rejected, it contains an error object. Not returned if a callback is given.
 */
async function getAllItems(
  playlistId: string
): Promise<SpotifyApi.PlaylistTrackObject[]> {
  const data = await spotifyApi.getPlaylistTracks(playlistId);
  const numBatches = Math.floor(data.body.total / 100) + 1;
  const promises: Promise<Response<SpotifyApi.PlaylistTrackResponse>>[] = [];
  for (let batchNum = 0; batchNum < numBatches; batchNum++) {
    const promise = getItems(playlistId, batchNum * 100);
    promises.push(promise);
  }
  const rawSongData = await Promise.all(promises);
  let tracks: SpotifyApi.PlaylistTrackObject[] = [];
  for (let i = 0; i < rawSongData.length; i++) {
    tracks = tracks.concat(rawSongData[i].body.items);
  }
  return tracks;
}

/**
 * Get tracks in a playlist.
 * @param playlistId The playlist's ID.
 * @param offset Offset.
 * @return A promise that if successful, resolves to an object that containing
 * the tracks in the playlist. If rejected, it contains an error object. Not returned if a callback is given.
 */
async function getItems(
  playlistId: string,
  offset: number
): Promise<Response<SpotifyApi.PlaylistTrackResponse>> {
  const tracks = await spotifyApi.getPlaylistTracks(playlistId, {
    offset: offset,
  });
  return tracks;
}

export default activityFunction;
