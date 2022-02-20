import * as df from "durable-functions";
import moment from "moment";

export interface SPCRequest {
  contributors: string[];
  playlistId: string;
  state: string;
}

const orchestrator = df.orchestrator(function* (context) {
  const firstRetryIntervalInMilliseconds = 5000;
  const maxNumberOfAttempts = 3;

  const retryOptions = new df.RetryOptions(
    firstRetryIntervalInMilliseconds,
    maxNumberOfAttempts
  );

  const data = context.bindingData.input as SPCRequest;

  yield context.df.callActivity("RefreshToken", data.state);
  yield context.df.callActivityWithRetry("PlaylistCleanup", retryOptions, data);

  // sleep for one hour between cleanups (should not exeed token expired time)
  const nextCleanup = moment
    .utc(context.df.currentUtcDateTime)
    .add(process.env.CLEANUP_INTERVAL, "m");
  yield context.df.createTimer(nextCleanup.toDate());

  yield context.df.continueAsNew(data);
});

export default orchestrator;
