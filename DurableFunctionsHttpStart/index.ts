import * as df from "durable-functions";
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { IHttpResponse } from "durable-functions/lib/src/ihttpresponse";

const httpStart: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<IHttpResponse> {
  const client = df.getClient(context);
  const instanceId = await client.startNew(
    req.params.functionName,
    undefined,
    req.body
  );

  context.log(`Started orchestration with ID = '${instanceId}'.`);

  return client.createCheckStatusResponse(context.bindingData.req, instanceId);
};

export default httpStart;
